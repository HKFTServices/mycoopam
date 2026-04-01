import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Connection, Request as TediousRequest } from "npm:tedious@18";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function queryMssql(config: Record<string, unknown>, sql: string): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const mssqlPort = Deno.env.get("MSSQL_PORT");
    const port = mssqlPort ? parseInt(mssqlPort, 10) : 1433;
    console.log("Connecting to MSSQL:", config.server, "port:", port);

    const connConfig: Record<string, unknown> = {
      server: config.server as string,
      authentication: {
        type: "default",
        options: {
          userName: config.user as string,
          password: config.password as string,
        },
      },
      options: {
        database: config.database as string,
        encrypt: true,
        trustServerCertificate: true,
        requestTimeout: 60000,
        connectTimeout: 30000,
        port,
        instanceName: config.instanceName as string || undefined,
      },
    };

    const connection = new Connection(connConfig as any);
    connection.on("connect", (err: Error | undefined) => {
      if (err) { reject(err); return; }
      const rows: Record<string, unknown>[] = [];
      const request = new TediousRequest(sql, (reqErr: Error | null) => {
        connection.close();
        if (reqErr) reject(reqErr); else resolve(rows);
      });
      request.on("row", (columns: Array<{ metadata: { colName: string }; value: unknown }>) => {
        const row: Record<string, unknown> = {};
        for (const col of columns) row[col.metadata.colName] = col.value;
        rows.push(row);
      });
      connection.execSql(request);
    });
    connection.connect();
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!serviceKey) throw new Error("Service role key not configured");
    const adminClient = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const { tenant_id, dry_run = true } = body;
    if (!tenant_id) throw new Error("Missing tenant_id");

    // 1. Fetch legacy entity_user_relationships with RelationshipTypeId
    const mssqlHost = Deno.env.get("MSSQL_HOST");
    const mssqlDatabase = Deno.env.get("MSSQL_DATABASE");
    const mssqlUser = Deno.env.get("MSSQL_USER");
    const mssqlPassword = Deno.env.get("MSSQL_PASSWORD");
    if (!mssqlHost || !mssqlDatabase || !mssqlUser || !mssqlPassword) throw new Error("SQL Server credentials not configured");

    console.log("Fetching legacy entity_user_relationships...");
    const legacyRows = await queryMssql(
      { server: mssqlHost, database: mssqlDatabase, user: mssqlUser, password: mssqlPassword },
      `SELECT CAST(Id AS VARCHAR(36)) AS legacy_id,
        CAST(RelationshipTypeId AS VARCHAR(36)) AS legacy_relationship_type_id
       FROM dbo.EntityUserRelationships
       WHERE IsDeleted = 0`
    );
    console.log(`Fetched ${legacyRows.length} legacy rows`);

    // 2. Get global relationship_type mappings
    const { data: relTypeMappings } = await adminClient
      .from("legacy_id_mappings")
      .select("legacy_id, new_id")
      .eq("table_name", "relationship_types");

    const relTypeMap = new Map<string, string>();
    for (const m of (relTypeMappings ?? [])) {
      relTypeMap.set(String(m.legacy_id), m.new_id);
    }
    console.log(`Loaded ${relTypeMap.size} relationship type mappings`);

    // 3. Get existing imported relationship mappings for this tenant
    const { data: existingMappings } = await adminClient
      .from("legacy_id_mappings")
      .select("legacy_id, new_id")
      .eq("table_name", "entity_user_relationships")
      .eq("tenant_id", tenant_id);

    const existingMap = new Map<string, string>();
    for (const m of (existingMappings ?? [])) {
      existingMap.set(String(m.legacy_id), m.new_id);
    }
    console.log(`Loaded ${existingMap.size} existing UER mappings for tenant`);

    // 4. Get relationship type names
    const { data: relTypes } = await adminClient.from("relationship_types").select("id, name");
    const relTypeNameMap = new Map<string, string>();
    for (const rt of (relTypes ?? [])) relTypeNameMap.set(rt.id, rt.name);

    const myselfId = "ff74a3e5-b204-4719-8031-18c47f557b8b";

    // 5. Build updates - find records that are "Myself" but should be something else
    const potentialUpdates: Array<{ uer_id: string; legacy_id: string; new_rel_type_id: string; new_rel_type_name: string }> = [];

    for (const legacyRow of legacyRows) {
      const legacyId = String(legacyRow.legacy_id);
      const legacyRelTypeId = String(legacyRow.legacy_relationship_type_id);

      const uerId = existingMap.get(legacyId);
      if (!uerId) continue; // Not imported for this tenant

      const correctRelTypeId = relTypeMap.get(legacyRelTypeId);
      if (!correctRelTypeId) continue;
      if (correctRelTypeId === myselfId) continue; // Already correct

      potentialUpdates.push({
        uer_id: uerId,
        legacy_id: legacyId,
        new_rel_type_id: correctRelTypeId,
        new_rel_type_name: relTypeNameMap.get(correctRelTypeId) || "Unknown",
      });
    }
    console.log(`Found ${potentialUpdates.length} potential updates`);

    // 6. Filter to only those currently set to "Myself"
    const finalUpdates: typeof potentialUpdates = [];
    if (potentialUpdates.length > 0) {
      // Batch check in groups of 100
      for (let i = 0; i < potentialUpdates.length; i += 100) {
        const batch = potentialUpdates.slice(i, i + 100);
        const uerIds = batch.map(u => u.uer_id);
        const { data: currentRecords } = await adminClient
          .from("user_entity_relationships")
          .select("id, relationship_type_id")
          .in("id", uerIds);

        const currentMap = new Map<string, string>();
        for (const r of (currentRecords ?? [])) currentMap.set(r.id, r.relationship_type_id);

        for (const u of batch) {
          if (currentMap.get(u.uer_id) === myselfId) {
            finalUpdates.push(u);
          }
        }
      }
    }
    console.log(`${finalUpdates.length} records need updating (currently Myself, should be different)`);

    // 7. Apply updates if not dry run
    const applied: string[] = [];
    const errors: string[] = [];
    if (!dry_run) {
      for (const u of finalUpdates) {
        const { error } = await adminClient
          .from("user_entity_relationships")
          .update({ relationship_type_id: u.new_rel_type_id })
          .eq("id", u.uer_id);
        if (error) {
          errors.push(`${u.uer_id}: ${error.message}`);
        } else {
          applied.push(`${u.uer_id} -> ${u.new_rel_type_name}`);
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      dry_run,
      legacy_records_fetched: legacyRows.length,
      mapped_to_tenant: existingMap.size,
      updates_needed: finalUpdates.length,
      updates_detail: finalUpdates.map(u => ({
        uer_id: u.uer_id,
        legacy_id: u.legacy_id,
        from: "Myself",
        to: u.new_rel_type_name,
      })),
      applied: dry_run ? 0 : applied.length,
      errors,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("fix-relationship-types error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
