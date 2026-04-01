import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Auth: require user token
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const adminClient = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const { tenant_id, dry_run = true, legacy_data } = body;
    if (!tenant_id) throw new Error("Missing tenant_id");
    if (!legacy_data || !Array.isArray(legacy_data)) throw new Error("Missing legacy_data array");

    // legacy_data is an array of { legacy_id, legacy_relationship_type_id }
    // from the fetch-legacy-data edge function (entity_user_relationships table)

    // 1. Get global relationship_type mappings (any tenant)
    const { data: relTypeMappings } = await adminClient
      .from("legacy_id_mappings")
      .select("legacy_id, new_id")
      .eq("table_name", "relationship_types");

    const relTypeMap = new Map<string, string>();
    for (const m of (relTypeMappings ?? [])) {
      relTypeMap.set(String(m.legacy_id), m.new_id);
    }

    // 2. Get existing imported UER mappings for this tenant
    const { data: existingMappings } = await adminClient
      .from("legacy_id_mappings")
      .select("legacy_id, new_id")
      .eq("table_name", "entity_user_relationships")
      .eq("tenant_id", tenant_id);

    const existingMap = new Map<string, string>();
    for (const m of (existingMappings ?? [])) {
      existingMap.set(String(m.legacy_id), m.new_id);
    }

    // 3. Get relationship type names
    const { data: relTypes } = await adminClient.from("relationship_types").select("id, name");
    const relTypeNameMap = new Map<string, string>();
    for (const rt of (relTypes ?? [])) relTypeNameMap.set(rt.id, rt.name);

    const myselfId = "ff74a3e5-b204-4719-8031-18c47f557b8b";

    // 4. Build potential updates
    const potentialUpdates: Array<{ uer_id: string; legacy_id: string; new_rel_type_id: string; new_rel_type_name: string }> = [];

    for (const row of legacy_data) {
      const legacyId = String(row.legacy_id);
      const legacyRelTypeId = String(row.legacy_relationship_type_id);

      const uerId = existingMap.get(legacyId);
      if (!uerId) continue;

      const correctRelTypeId = relTypeMap.get(legacyRelTypeId);
      if (!correctRelTypeId || correctRelTypeId === myselfId) continue;

      potentialUpdates.push({
        uer_id: uerId,
        legacy_id: legacyId,
        new_rel_type_id: correctRelTypeId,
        new_rel_type_name: relTypeNameMap.get(correctRelTypeId) || "Unknown",
      });
    }

    // 5. Filter to only those currently set to "Myself"
    const finalUpdates: typeof potentialUpdates = [];
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
        if (currentMap.get(u.uer_id) === myselfId) finalUpdates.push(u);
      }
    }

    // 6. Apply updates
    const applied: string[] = [];
    const errors: string[] = [];
    if (!dry_run) {
      for (const u of finalUpdates) {
        const { error } = await adminClient
          .from("user_entity_relationships")
          .update({ relationship_type_id: u.new_rel_type_id })
          .eq("id", u.uer_id);
        if (error) errors.push(`${u.uer_id}: ${error.message}`);
        else applied.push(`${u.uer_id} -> ${u.new_rel_type_name}`);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      dry_run,
      legacy_records_received: legacy_data.length,
      mapped_to_tenant: existingMap.size,
      updates_needed: finalUpdates.length,
      updates_detail: finalUpdates.map(u => ({
        uer_id: u.uer_id, legacy_id: u.legacy_id, from: "Myself", to: u.new_rel_type_name,
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
