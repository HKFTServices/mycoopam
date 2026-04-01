import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function hexToUint8Array(hex: string): Uint8Array {
  // Strip leading "0x" if present
  const clean = hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return bytes;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify user
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    // Use service role for storage uploads and DB inserts
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();
    const { tenant_id, mode = "import_one" } = body;
    // mode: "import_one" = single document with binary data

    if (!tenant_id) throw new Error("tenant_id required");

    if (mode === "import_one") {
      // Accept a single document record with binary data
      const { document } = body;
      if (!document) throw new Error("document object required for import_one mode");

      const legacyId = document.legacy_id || document.Id;
      if (!legacyId) throw new Error("Document must have legacy_id or Id");

      // Check if already imported
      const { data: existingMapping } = await adminClient
        .from("legacy_id_mappings")
        .select("legacy_id")
        .eq("tenant_id", tenant_id)
        .eq("table_name", "entity_documents")
        .eq("legacy_id", String(legacyId))
        .maybeSingle();

      if (existingMapping) {
        return new Response(JSON.stringify({
          success: true,
          action: "skipped",
          legacy_id: legacyId,
          reason: "Already imported",
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Resolve entity
      const legacyEntityId = document.legacy_entity_id || document.EntityId;
      const { data: entityMapping } = await adminClient
        .from("legacy_id_mappings")
        .select("new_id")
        .eq("tenant_id", tenant_id)
        .eq("table_name", "entities")
        .eq("legacy_id", String(legacyEntityId))
        .maybeSingle();

      if (!entityMapping) {
        return new Response(JSON.stringify({
          success: false,
          action: "error",
          legacy_id: legacyId,
          reason: `Entity ${legacyEntityId} not found in mappings`,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const entityId = entityMapping.new_id;

      // Resolve document type (optional) - try legacy mapping first, then name-based match
      const legacyDocTypeId = document.legacy_document_type_id || document.DocumentTypeId;
      const legacyDocTypeName = document.document_type_name || document.DocumentTypeName || "";
      let documentTypeId = null;
      if (legacyDocTypeId) {
        const { data: docTypeMapping } = await adminClient
          .from("legacy_id_mappings")
          .select("new_id")
          .eq("tenant_id", tenant_id)
          .eq("table_name", "document_types")
          .eq("legacy_id", String(legacyDocTypeId))
          .maybeSingle();
        documentTypeId = docTypeMapping?.new_id || null;
      }
      // Fallback: match by document type name
      if (!documentTypeId && legacyDocTypeName) {
        const { data: docTypeByName } = await adminClient
          .from("document_types")
          .select("id")
          .eq("tenant_id", tenant_id)
          .ilike("name", legacyDocTypeName.trim())
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();
        documentTypeId = docTypeByName?.id || null;
      }
      // Fallback: try to infer from filename
      if (!documentTypeId) {
        const fn = (document.file_name || document.FileName || "").toLowerCase();
        const namePatterns: [RegExp, string][] = [
          [/\bid[\s_-]?(card|document|book|copy)?\b|identity/i, "ID Passport"],
          [/passport/i, "ID Passport"],
          [/proof[\s_-]?of[\s_-]?address|poa\b|utility[\s_-]?bill|municipal/i, "Proof of Address"],
          [/proof[\s_-]?of[\s_-]?bank|bank[\s_-]?confirm|account[\s_-]?confirm/i, "Proof of Bank"],
          [/power[\s_-]?of[\s_-]?attorney|poa[\s_-]?/i, "Power of Attorney"],
          [/trust[\s_-]?deed/i, "Trust deed"],
          [/resolution[\s_-]?trust/i, "Resolution Trusts"],
          [/resolution/i, "Resolution"],
          [/affidavit/i, "Affidavit"],
        ];
        for (const [pattern, typeName] of namePatterns) {
          if (pattern.test(fn)) {
            const { data: matched } = await adminClient
              .from("document_types")
              .select("id")
              .eq("tenant_id", tenant_id)
              .ilike("name", typeName)
              .eq("is_active", true)
              .limit(1)
              .maybeSingle();
            if (matched) { documentTypeId = matched.id; break; }
          }
        }
      }

      // Decode binary data
      const bytesRaw = document.Bytes || document.bytes;
      if (!bytesRaw) {
        return new Response(JSON.stringify({
          success: false,
          action: "error",
          legacy_id: legacyId,
          reason: "No binary data (Bytes) provided",
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      let fileBytes: Uint8Array;
      if (typeof bytesRaw === "string") {
        // Could be hex (0x...) or base64
        if (bytesRaw.startsWith("0x") || bytesRaw.startsWith("0X")) {
          fileBytes = hexToUint8Array(bytesRaw);
        } else {
          fileBytes = base64ToUint8Array(bytesRaw);
        }
      } else {
        return new Response(JSON.stringify({
          success: false,
          action: "error",
          legacy_id: legacyId,
          reason: "Bytes must be a string (base64 or hex)",
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const fileName = (document.file_name || document.FileName || `document_${legacyId}`);
      const documentId = document.document_id || document.DocumentId || "";

      // Determine mime type from file extension
      const ext = fileName.split(".").pop()?.toLowerCase() || "";
      const mimeMap: Record<string, string> = {
        pdf: "application/pdf",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        gif: "image/gif",
        doc: "application/msword",
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      };
      const mimeType = mimeMap[ext] || "application/octet-stream";

      // Sanitize filename for storage (remove spaces and special chars)
      const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      // Upload to storage
      const storagePath = `${tenant_id}/${entityId}/${legacyId}_${safeFileName}`;
      const { error: uploadError } = await adminClient.storage
        .from("member-documents")
        .upload(storagePath, fileBytes, {
          contentType: mimeType,
          upsert: true,
        });

      if (uploadError) {
        return new Response(JSON.stringify({
          success: false,
          action: "error",
          legacy_id: legacyId,
          reason: `Upload failed: ${uploadError.message}`,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Parse document date
      let documentDate = null;
      const rawDate = document.document_date || document.DocumentDate;
      if (rawDate) {
        const d = new Date(rawDate);
        if (!isNaN(d.getTime())) {
          documentDate = d.toISOString().split("T")[0];
        }
      }

      const isActive = document.is_active === true || document.is_active === 1 ||
        document.is_active === "1" || document.IsActive === true ||
        document.IsActive === 1 || document.IsActive === "1" ||
        document.is_active === undefined; // default true if not specified

      // Insert into entity_documents
      const { data: insertedDoc, error: insertError } = await adminClient
        .from("entity_documents")
        .insert({
          tenant_id,
          entity_id: entityId,
          document_type_id: documentTypeId,
          description: (document.description || document.Description || null),
          file_name: fileName,
          file_path: storagePath,
          file_size: fileBytes.length,
          mime_type: mimeType,
          document_date: documentDate,
          legacy_id: String(legacyId),
          legacy_document_id: String(documentId),
          is_active: isActive,
        })
        .select("id")
        .single();

      if (insertError) {
        return new Response(JSON.stringify({
          success: false,
          action: "error",
          legacy_id: legacyId,
          reason: `Insert failed: ${insertError.message}`,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Create legacy mapping
      await adminClient.from("legacy_id_mappings").insert({
        tenant_id,
        table_name: "entity_documents",
        legacy_id: String(legacyId),
        new_id: insertedDoc.id,
        description: fileName,
      });

      return new Response(JSON.stringify({
        success: true,
        action: "imported",
        legacy_id: legacyId,
        file_name: fileName,
        file_size: fileBytes.length,
        entity_id: entityId,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    throw new Error(`Unknown mode: ${mode}`);
  } catch (err: any) {
    console.error("import-entity-documents error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
