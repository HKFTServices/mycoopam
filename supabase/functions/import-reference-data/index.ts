import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Global reference tables — match by name, create legacy_id_mappings only (no inserts)
// tenantScoped: if true, filter target table by tenant_id when matching
const GLOBAL_TABLE_CONFIGS: Record<string, { matchField: string; targetTable: string; tenantScoped?: boolean }> = {
  countries: { matchField: "name", targetTable: "countries" },
  titles: { matchField: "description", targetTable: "titles" },
  entity_categories: { matchField: "name", targetTable: "entity_categories" },
  relationship_types: { matchField: "name", targetTable: "relationship_types" },
  entity_account_types: { matchField: "name", targetTable: "entity_account_types", tenantScoped: true },
  banks: { matchField: "name", targetTable: "banks" },
  bank_account_types: { matchField: "name", targetTable: "bank_account_types" },
  document_types: { matchField: "name", targetTable: "document_types", tenantScoped: true },
};

// Reference-only tables — store metadata in legacy_id_mappings for later FK resolution (no target table)
const REFERENCE_ONLY_TABLES = new Set(["gen_type_values", "ex_fees", "cashflow_transactions", "bookkeeping"]);
const TABLE_CONFIGS: Record<string, { required: string[]; optional: string[]; nameField: string }> = {
  control_accounts: {
    required: ["name", "account_type"],
    optional: ["pool_id", "is_active"],
    nameField: "name",
  },
  pools: {
    required: ["name"],
    optional: ["description", "open_unit_price", "fixed_unit_price", "pool_statement_description", "pool_statement_display_type", "is_active"],
    nameField: "name",
  },
  items: {
    required: ["item_code", "description", "pool_id"],
    optional: [
      "margin_percentage", "is_stock_item", "is_active",
      "calculation_type", "use_fixed_price", "calculate_price_with_factor",
      "api_link", "api_key", "api_code", "tax_type_id",
      "show_item_price_on_statement",
    ],
    nameField: "item_code",
  },
  income_expense_items: {
    required: ["item_code", "description"],
    optional: [
      "recurrence_type", "debit_control_account_id", "credit_control_account_id",
      "amount", "percentage", "tax_type_id",
      "vat", "bankflow", "extra1",
      "is_active", "is_deleted", "creator_user_id", "last_modifier_user_id",
      "deleter_user_id", "deletion_time",
    ],
    nameField: "item_code",
  },
  member_shares: {
    required: ["entity_account_id", "transaction_date", "quantity", "value"],
    optional: [
      "creator_user_id", "last_modifier_user_id",
      "is_deleted", "deleter_user_id", "deletion_time",
    ],
    nameField: "transaction_date",
  },
};

// Custom import tables with specialized logic
const CUSTOM_TABLES = new Set(["entities", "entity_accounts", "entity_user_relationships", "entity_addresses", "users", "unit_transactions", "stock_transactions", "daily_stock_prices", "daily_pool_prices", "entity_banks", "document_entity_requirements", "entity_documents", "agent_house_agents", "referrers"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify calling user is admin
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    // Use service role for imports (bypasses RLS)
    const adminClient = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { table_name, tenant_id, records, import_batch, dry_run } = body;
    const isDryRun = dry_run === true;

    if (!table_name || !tenant_id || !Array.isArray(records) || records.length === 0) {
      throw new Error("Missing required fields: table_name, tenant_id, records[]");
    }

    // Handle global reference table mapping (titles, entity_categories)
    const globalConfig = GLOBAL_TABLE_CONFIGS[table_name];
    if (globalConfig) {
      const results = { mapped: 0, skipped: 0, not_found: 0, errors: [] as string[], dry_run: isDryRun, simulation: [] as Record<string, unknown>[] };
      const batchId = import_batch || `import_${Date.now()}`;
      let firstRecordLogged = false;

      for (const record of records) {
        try {
          if (!firstRecordLogged) {
            console.log("Global import first record keys:", JSON.stringify(Object.keys(record)));
            console.log("Global import first record sample:", JSON.stringify(record).slice(0, 500));
            firstRecordLogged = true;
          }
          let legacyId = record.legacy_id || record.id || record.Id || record.ID;
          if (!legacyId) {
            // Fallback: search keys case-insensitively for 'id' or 'legacy_id'
            for (const key of Object.keys(record)) {
              const lk = key.replace(/^\uFEFF/, '').trim().toLowerCase();
              if (lk === "id" || lk === "legacy_id") {
                legacyId = record[key];
                break;
              }
            }
          }
          if (!legacyId) {
            results.errors.push(`Record missing legacy_id: ${JSON.stringify(record).slice(0, 100)}`);
            continue;
          }

          // Check if already mapped
          const { data: existing } = await adminClient
            .from("legacy_id_mappings")
            .select("new_id")
            .eq("tenant_id", tenant_id)
            .eq("table_name", table_name)
            .eq("legacy_id", String(legacyId))
            .maybeSingle();

          if (existing) {
            results.skipped++;
            results.simulation.push({ legacy_id: legacyId, action: "skip_already_mapped", new_id: existing.new_id });
            continue;
          }

          // Find matching record in target table by name — flexible key lookup
          // CSV headers may have BOM, extra spaces, or varying cases
          let nameValue = record.name || record.Name || record.BankName || record.DisplayName || record.DocumentName || record.Description || record.description || record[globalConfig.matchField];
          if (!nameValue) {
            // Fallback: search all keys case-insensitively for 'name' or the matchField
            const targetKeys = ["name", globalConfig.matchField, "description", "displayname", "documentname"];
            for (const key of Object.keys(record)) {
              const lk = key.replace(/^\uFEFF/, '').trim().toLowerCase();
              if (targetKeys.includes(lk)) {
                nameValue = record[key];
                break;
              }
            }
          }
          if (!nameValue) {
            results.errors.push(`Record ${legacyId}: missing name field`);
            continue;
          }

          let matchQuery = adminClient
            .from(globalConfig.targetTable)
            .select("id")
            .ilike(globalConfig.matchField, String(nameValue).trim());
          if (globalConfig.tenantScoped) {
            matchQuery = matchQuery.eq("tenant_id", tenant_id);
          }
          const { data: match } = await matchQuery.maybeSingle();

          let matchedId: string | null = match?.id ?? null;

          // For banks: update country_id and other fields on existing matched records
          if (matchedId && globalConfig.targetTable === "banks") {
            const updateFields: Record<string, unknown> = {};
            const legacyCountryId = record.country_id || record.CountryId || record.CountryID;
            const countryName = record.country || record.Country || record.country_name || record.CountryName;
            if (legacyCountryId) {
              const { data: countryMapping } = await adminClient.from("legacy_id_mappings")
                .select("new_id")
                .eq("tenant_id", tenant_id)
                .eq("table_name", "countries")
                .eq("legacy_id", String(legacyCountryId))
                .maybeSingle();
              if (countryMapping) updateFields.country_id = countryMapping.new_id;
            } else if (countryName) {
              const { data: countryMatch } = await adminClient.from("countries")
                .select("id").ilike("name", String(countryName).trim()).maybeSingle();
              if (countryMatch) updateFields.country_id = countryMatch.id;
            }
            const branchCode = record.branch_code || record.BranchCode;
            const swiftCode = record.swift_code || record.SwiftCode || record.SWIFT;
            const sortRouteCode = record.sort_route_code || record.SortRouteCode;
            if (branchCode) updateFields.branch_code = String(branchCode).trim();
            if (swiftCode) updateFields.swift_code = String(swiftCode).trim();
            if (sortRouteCode) updateFields.sort_route_code = String(sortRouteCode).trim();
            if (Object.keys(updateFields).length > 0) {
              await adminClient.from("banks").update(updateFields).eq("id", matchedId);
            }
          }

          // For countries: also try matching by iso_code if name didn't match
          if (!matchedId && globalConfig.targetTable === "countries") {
            const isoCode = record.iso_code || record.IsoCode || record.Code || record.code || record.ISO || record.ShortCode || record.shortcode || record.short_code || "";
            if (isoCode) {
              const { data: isoMatch } = await adminClient
                .from("countries")
                .select("id")
                .ilike("iso_code", String(isoCode).trim())
                .maybeSingle();
              if (isoMatch) {
                matchedId = isoMatch.id;
                // Also update the name to match the CSV
                await adminClient.from("countries").update({ name: String(nameValue).trim() }).eq("id", isoMatch.id);
                results.simulation.push({ legacy_id: legacyId, action: "matched_by_iso", name: nameValue, iso_code: isoCode, new_id: matchedId });
              }
            }
          }

          // Auto-create if not found (for non-tenant-scoped global tables like titles, banks, etc.)
          if (!matchedId) {
            const insertRow: Record<string, unknown> = {
              [globalConfig.matchField]: String(nameValue).trim(),
              is_active: true,
            };
            // Countries require iso_code
            if (globalConfig.targetTable === "countries") {
              const isoCode = record.iso_code || record.IsoCode || record.Code || record.code || record.ISO || record.ShortCode || record.shortcode || record.short_code || "";
              insertRow.iso_code = String(isoCode).trim().toUpperCase() || String(nameValue).trim().substring(0, 2).toUpperCase();
            }
            // For tenant-scoped tables, include tenant_id
            if (globalConfig.tenantScoped) {
              insertRow.tenant_id = tenant_id;
            }
            // entity_categories requires entity_type — derive from name
            if (globalConfig.targetTable === "entity_categories") {
              const nameLower = String(nameValue).trim().toLowerCase();
              insertRow.entity_type = nameLower === "natural person" ? "natural_person" : "legal_entity";
              // Also check if the record itself carries entity_type
              const recordEntityType = record.entity_type || record.EntityType;
              if (recordEntityType) {
                const et = String(recordEntityType).toLowerCase().trim();
                insertRow.entity_type = (et === "natural_person" || et === "1" || et === "naturalperson") ? "natural_person" : "legal_entity";
              }
            }
            // relationship_types requires entity_category_id — resolve from record
            if (globalConfig.targetTable === "relationship_types") {
              const legacyCatId = record.entity_category_id || record.EntityCategoryId || record.EntityCategoryID;
              if (legacyCatId) {
                // Resolve from legacy_id_mappings
                const { data: catMapping } = await adminClient.from("legacy_id_mappings")
                  .select("new_id")
                  .eq("tenant_id", tenant_id)
                  .eq("table_name", "entity_categories")
                  .eq("legacy_id", String(legacyCatId))
                  .maybeSingle();
                if (catMapping) {
                  insertRow.entity_category_id = catMapping.new_id;
                } else {
                  results.errors.push(`${table_name} ${legacyId}: cannot resolve entity_category_id "${legacyCatId}"`);
                  results.not_found++;
                  continue;
                }
              } else {
                // Try to infer from name
                const nameLower = String(nameValue).trim().toLowerCase();
                // Names containing these keywords map to specific legal entity categories
                const categoryName = nameLower.includes("company") ? "Company"
                  : nameLower.includes("closed corporation") || nameLower.includes("close corporation") ? "Close Corporation"
                  : nameLower.includes("co-operative") || nameLower.includes("cooperative") ? "Co-operative"
                  : (nameLower.includes("corporation") && !nameLower.includes("close")) ? "Corporation"
                  : nameLower.includes("trust") ? "Trust"
                  : nameLower.includes("joint") ? "Joint Account"
                  : nameLower.includes("partnership") ? "Partnership"
                  : nameLower.includes("sole") ? "Sole Proprietory"
                  : nameLower.includes("political") ? "Political Party"
                  : "Natural Person"; // Default: personal relationship types

                const { data: cat } = await adminClient.from("entity_categories")
                  .select("id").ilike("name", categoryName).maybeSingle();
                if (cat) {
                  insertRow.entity_category_id = cat.id;
                } else {
                  // Fallback: use first Natural Person category
                  const { data: fallbackCat } = await adminClient.from("entity_categories")
                    .select("id").eq("entity_type", "natural_person").limit(1).maybeSingle();
                  if (fallbackCat) {
                    insertRow.entity_category_id = fallbackCat.id;
                  } else {
                    results.errors.push(`${table_name} ${legacyId}: no entity_category found for "${nameValue}"`);
                    results.not_found++;
                    continue;
                  }
                }
              }
            }
            // banks may carry a country reference — resolve country_id from legacy mapping or name
            if (globalConfig.targetTable === "banks") {
              const legacyCountryId = record.country_id || record.CountryId || record.CountryID;
              const countryName = record.country || record.Country || record.country_name || record.CountryName;
              if (legacyCountryId) {
                const { data: countryMapping } = await adminClient.from("legacy_id_mappings")
                  .select("new_id")
                  .eq("tenant_id", tenant_id)
                  .eq("table_name", "countries")
                  .eq("legacy_id", String(legacyCountryId))
                  .maybeSingle();
                if (countryMapping) insertRow.country_id = countryMapping.new_id;
              } else if (countryName) {
                const { data: countryMatch } = await adminClient.from("countries")
                  .select("id").ilike("name", String(countryName).trim()).maybeSingle();
                if (countryMatch) insertRow.country_id = countryMatch.id;
              }
              // Also pick up branch_code, swift_code, sort_route_code if present
              const branchCode = record.branch_code || record.BranchCode;
              const swiftCode = record.swift_code || record.SwiftCode || record.SWIFT;
              const sortRouteCode = record.sort_route_code || record.SortRouteCode;
              if (branchCode) insertRow.branch_code = String(branchCode).trim();
              if (swiftCode) insertRow.swift_code = String(swiftCode).trim();
              if (sortRouteCode) insertRow.sort_route_code = String(sortRouteCode).trim();
            }
            // entity_account_types requires prefix — resolve from record or infer
            if (globalConfig.targetTable === "entity_account_types") {
              const prefix = record.prefix || record.Prefix;
              if (prefix) {
                insertRow.prefix = String(prefix).trim();
              } else {
                const n = String(nameValue).trim().toLowerCase();
                insertRow.prefix = n.includes("supplier") ? "SUP"
                  : n.includes("referral") ? "REF"
                  : n.includes("customer") ? "CUS"
                  : n.includes("membership") ? "MEM"
                  : n.includes("agent") ? "AGT"
                  : String(nameValue).trim().substring(0, 3).toUpperCase();
              }
            }
            if (isDryRun) {
              results.simulation.push({ legacy_id: legacyId, action: "will_create", name: nameValue, table: globalConfig.targetTable });
              results.mapped++;
              continue;
            }

            let created: { id: string } | null = null;
            let createErr: any = null;

            // For countries, use upsert on iso_code to handle conflicts
            if (globalConfig.targetTable === "countries" && insertRow.iso_code) {
              const { data: d, error: e } = await adminClient
                .from("countries")
                .upsert(insertRow as any, { onConflict: "iso_code" })
                .select("id")
                .single();
              created = d;
              createErr = e;
            } else {
              const { data: d, error: e } = await adminClient
                .from(globalConfig.targetTable)
                .insert(insertRow)
                .select("id")
                .single();
              created = d;
              createErr = e;
            }

            if (createErr || !created) {
              results.errors.push(`${table_name} ${legacyId}: failed to create "${nameValue}": ${createErr?.message}`);
              results.not_found++;
              continue;
            }
            matchedId = created.id;
            results.simulation.push({ legacy_id: legacyId, action: "created", name: nameValue, new_id: matchedId });
          } else {
            results.simulation.push({ legacy_id: legacyId, action: isDryRun ? "will_map" : "mapped", name: nameValue, new_id: matchedId });
          }

          if (!isDryRun) {
            await adminClient.from("legacy_id_mappings").insert({
              tenant_id,
              table_name,
              legacy_id: String(legacyId),
              new_id: matchedId,
              import_batch: batchId,
              notes: `${match ? "Mapped" : "Created"} ${globalConfig.matchField}: ${nameValue}`,
            });
          }
          results.mapped++;
        } catch (recErr: any) {
          results.errors.push(`Record error: ${recErr.message}`);
        }
      }

      return new Response(JSON.stringify({ success: true, batch: batchId, ...results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle reference-only tables (gen_type_values, ex_fees) — store in legacy_id_mappings with metadata
    if (REFERENCE_ONLY_TABLES.has(table_name)) {
      const results = { inserted: 0, skipped: 0, errors: [] as string[], dry_run: isDryRun, simulation: [] as Record<string, unknown>[] };
      const batchId = import_batch || `import_${Date.now()}`;

      // Pre-fetch all legacy_id_mappings for this tenant to resolve ID columns
      const { data: allMappings } = await adminClient.from("legacy_id_mappings")
        .select("legacy_id, table_name, description")
        .eq("tenant_id", tenant_id);
      const mappingLookup: Record<string, string> = {};
      if (allMappings) {
        for (const m of allMappings) {
          if (m.description) mappingLookup[m.legacy_id] = m.description;
        }
      }

      for (const record of records) {
        try {
          const legacyId = String(record.id || record.ID || record.legacy_id || "");
          if (!legacyId) { results.errors.push(`Record missing id: ${JSON.stringify(record).slice(0, 100)}`); continue; }

          // Check if already imported
          const { data: existing } = await adminClient.from("legacy_id_mappings").select("new_id")
            .eq("tenant_id", tenant_id).eq("table_name", table_name).eq("legacy_id", legacyId).maybeSingle();

          // Build metadata notes from all fields (moved up so we can use it for updates too)
          const notesObj: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(record)) {
            if (v !== null && v !== undefined && String(v).trim() !== "") notesObj[k] = v;
          }
          const notes = JSON.stringify(notesObj);

          if (existing) {
            // Update existing record with latest notes (picks up new fields)
            if (!isDryRun) {
              await adminClient.from("legacy_id_mappings")
                .update({ notes, imported_at: new Date().toISOString() })
                .eq("tenant_id", tenant_id).eq("table_name", table_name).eq("legacy_id", legacyId);
            }
            results.inserted++;
            results.simulation.push({ legacy_id: legacyId, action: isDryRun ? "will_update" : "updated" });
            continue;
          }

          // (notesObj and notes already built above)

          // Build a rich description: resolve all ID columns to their names
          const descParts: string[] = [];
          const nameVal = record.name || record.Name || record.fee_name || record.Fee;
          if (nameVal) descParts.push(String(nameVal));

          for (const [k, v] of Object.entries(record)) {
            if (/ID$/i.test(k) && !/^(id|ID|legacy_id)$/i.test(k) && v && String(v) !== "0") {
              const resolved = mappingLookup[String(v)];
              descParts.push(`${k}:${resolved || String(v)}`);
            }
          }

          if (descParts.length === 0) descParts.push(`ID:${legacyId}`);
          const description = descParts.join(" | ");

          results.simulation.push({ legacy_id: legacyId, action: isDryRun ? "will_insert" : "insert", name: description, mapped_fields: notesObj });

          if (!isDryRun) {
            const newId = crypto.randomUUID();
            const { error: insErr } = await adminClient.from("legacy_id_mappings").upsert({
              tenant_id,
              table_name,
              legacy_id: legacyId,
              new_id: newId,
              import_batch: batchId,
              notes,
              description: description.slice(0, 500),
            }, { onConflict: "tenant_id,table_name,legacy_id", ignoreDuplicates: true });
            if (insErr) { results.errors.push(`${table_name} ${legacyId}: ${insErr.message}`); continue; }
          }
          results.inserted++;
        } catch (recErr: any) {
          results.errors.push(`Record error: ${recErr.message}`);
        }
      }

      return new Response(JSON.stringify({ success: true, batch: batchId, ...results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle custom entity-related imports
    if (CUSTOM_TABLES.has(table_name)) {
      // Verify permissions first
      const { data: roleCheck2 } = await adminClient.rpc("has_tenant_role", {
        _user_id: user.id, _role: "tenant_admin", _tenant_id: tenant_id,
      });
      const { data: superCheck2 } = await adminClient.rpc("has_role", {
        _user_id: user.id, _role: "super_admin",
      });
      if (!roleCheck2 && !superCheck2) throw new Error("Insufficient permissions");

      const results = { inserted: 0, skipped: 0, errors: [] as string[], dry_run: isDryRun, simulation: [] as Record<string, unknown>[] };
      const batchId = import_batch || `import_${Date.now()}`;

      // Helper to resolve legacy FK
      async function resolveLegacy(tbl: string, legId: string | undefined | null): Promise<string | null> {
        if (!legId || String(legId).toUpperCase() === "NULL" || String(legId).trim() === "") return null;
        const { data } = await adminClient.from("legacy_id_mappings").select("new_id")
          .eq("tenant_id", tenant_id).eq("table_name", tbl).eq("legacy_id", String(legId)).maybeSingle();
        return data?.new_id || null;
      }

      const isNullish = (v: unknown) => v === undefined || v === null || String(v).toUpperCase() === "NULL" || String(v).trim() === "";
      const val = (v: unknown) => isNullish(v) ? null : v;
      const toBool = (v: unknown, def: boolean): boolean => {
        if (v === undefined || v === null) return def;
        if (typeof v === "boolean") return v;
        if (typeof v === "number") return v !== 0;
        const s = String(v).toLowerCase().trim();
        if (s === "true" || s === "1" || s === "yes") return true;
        if (s === "false" || s === "0" || s === "no") return false;
        return def;
      };

      for (const record of records) {
        try {
          const legacyId = record.legacy_id || record.id || record.Id || record.ID;
          if (!legacyId) { results.errors.push(`Missing legacy_id: ${JSON.stringify(record).slice(0, 80)}`); continue; }

          // Check if already imported
          const { data: existing } = await adminClient.from("legacy_id_mappings").select("new_id")
            .eq("tenant_id", tenant_id).eq("table_name", table_name).eq("legacy_id", String(legacyId)).maybeSingle();

          // For users, allow re-import to update status; for entities, update existing; for others, skip
          if (existing && table_name !== "users" && table_name !== "entity_accounts" && table_name !== "entities") { results.skipped++; continue; }

          let newId: string | null = null;

          if (table_name === "entities") {
            const titleId = await resolveLegacy("titles", record.legacy_title_id || record.TitleId);
            const catId = await resolveLegacy("entity_categories", record.legacy_entity_category_id || record.EntityCategoryId);

            // Resolve agent_house_agent_id: legacy AgentHouseAgentId → junction table → agent entity
            const rawAgentHouseAgentId = record.legacy_agent_house_agent_id || record.AgentHouseAgentId;
            let agentHouseAgentId: string | null = null;
            if (rawAgentHouseAgentId && !isNullish(rawAgentHouseAgentId)) {
              // Look up the junction table record to get the agent entity
              const junctionNewId = await resolveLegacy("agent_house_agents", rawAgentHouseAgentId);
              if (junctionNewId) {
                agentHouseAgentId = junctionNewId; // new_id stores the agent entity ID
              }
            }

            const row: Record<string, unknown> = {
              tenant_id,
              name: record.name || record.Name,
              initials: val(record.initials || record.Initials),
              known_as: val(record.known_as || record.KnownAs),
              last_name: val(record.last_name || record.LastName),
              gender: val(record.gender || record.Gender),
              identity_number: val(record.identity_number || record.IdentityNumber),
              passport_number: val(record.passport_number || record.PassportNumber),
              registration_number: val(record.registration_number || record.RegistrationNumber),
              contact_number: val(record.contact_number || record.ContactNumber),
              additional_contact_number: val(record.additional_contact_number || record.AdditionalContactNumber),
              email_address: val(record.email_address || record.EmailAddress),
              additional_email_address: val(record.additional_email_address || record.AdditionalEmailAddress),
              is_vat_registered: record.is_vat_registered ?? record.IsVatRegistered ?? false,
              vat_number: val(record.vat_number || record.VatNumber),
              is_active: record.is_active ?? record.IsActive ?? true,
              title_id: titleId,
              entity_category_id: catId,
              is_deleted: record.is_deleted ?? record.IsDeleted ?? false,
              agent_commission_percentage: val(record.agent_commission_percentage || record.AgentCommissionPercentage) ?? 0,
              is_registration_complete: record.is_registration_complete ?? record.IsRegistrationComplete ?? false,
              date_of_birth: val(record.date_of_birth || record.DateOfBirth),
              legacy_user_id: val(record.legacy_user_id || record.LegacyUserId),
              website: val(record.website || record.Website),
              agent_house_agent_id: agentHouseAgentId,
            };

            if (!row.name) { results.errors.push(`Entity ${legacyId}: missing name`); continue; }

            // Normalize gender
            if (row.gender !== null) {
              const g = String(row.gender).toLowerCase();
              if (g === "1" || g === "male" || g === "m") row.gender = "male";
              else if (g === "0" || g === "female" || g === "f") row.gender = "female";
              else row.gender = null;
            }

            // If mapping already exists, UPDATE the existing entity instead of inserting
            if (existing) {
              const existingEntityId = existing.new_id;
              // Remove tenant_id from update payload (can't change it)
              const { tenant_id: _tid, ...updateRow } = row;
              results.simulation.push({ legacy_id: legacyId, action: isDryRun ? "will_update" : "update", name: row.name, entity_id: existingEntityId, mapped_fields: updateRow });
              if (!isDryRun) {
                const { error: updErr } = await adminClient.from("entities").update(updateRow).eq("id", existingEntityId);
                if (updErr) { results.errors.push(`Entity ${legacyId} update: ${updErr.message}`); continue; }
                newId = existingEntityId;
              }
              results.inserted++;
              continue;
            }

            results.simulation.push({ legacy_id: legacyId, action: isDryRun ? "will_insert" : "insert", name: row.name, source_record: record, mapped_fields: row });
            if (!isDryRun) {
              const { data: ins, error: insErr } = await adminClient.from("entities").insert(row).select("id").single();
              if (insErr) { results.errors.push(`Entity ${legacyId}: ${insErr.message}`); continue; }
              newId = ins.id;
            }

          } else if (table_name === "entity_accounts") {
            const entityId = await resolveLegacy("entities", record.legacy_entity_id || record.EntityId);
            const typeId = await resolveLegacy("entity_account_types", record.legacy_entity_account_type_id || record.EntityAccountTypeId);

            if (!entityId) { results.errors.push(`EntityAccount ${legacyId}: entity not found for legacy_entity_id`); continue; }
            if (!typeId) { results.errors.push(`EntityAccount ${legacyId}: account type not found`); continue; }

            // Find client_account_id by scanning all record keys case-insensitively
            let clientAccountId: unknown = null;
            for (const key of Object.keys(record)) {
              if (key.toLowerCase().includes("clientaccount") || key.toLowerCase() === "client_account_id") {
                clientAccountId = record[key];
                console.log(`Found client_account_id field: key=${key}, value=${record[key]}`);
                break;
              }
            }
            if (clientAccountId === undefined || clientAccountId === null || clientAccountId === "") clientAccountId = null;
            const row: Record<string, unknown> = {
              tenant_id,
              entity_id: entityId,
              entity_account_type_id: typeId,
              account_number: val(record.account_number || record.Number),
              is_approved: toBool(record.is_approved ?? record.IsApproved, false),
              is_active: toBool(record.is_active ?? record.IsActive, true),
              status: toBool(record.is_approved ?? record.IsApproved, false) ? "approved" : "pending_activation",
              client_account_id: clientAccountId != null ? Number(clientAccountId) : null,
            };

            results.simulation.push({ legacy_id: legacyId, action: isDryRun ? "will_upsert" : "upsert", account_number: row.account_number, source_record: record, mapped_fields: row });
            if (!isDryRun) {
              // Check if already imported via legacy_id_mappings
              let existingMapping = await resolveLegacy("entity_accounts", String(legacyId));
              
              // Fallback: check by entity_id + account_type to find already-imported accounts
              if (!existingMapping) {
                const { data: existingEa } = await adminClient
                  .from("entity_accounts")
                  .select("id")
                  .eq("tenant_id", tenant_id)
                  .eq("entity_id", entityId)
                  .eq("entity_account_type_id", typeId)
                  .maybeSingle();
                if (existingEa) existingMapping = existingEa.id;
              }
              
              if (existingMapping) {
                newId = existingMapping;
                // Update client_account_id if available (use != null to allow 0)
                const caid = clientAccountId != null ? Number(clientAccountId) : null;
                if (caid != null) {
                  const { error: updErr } = await adminClient.from("entity_accounts").update({ client_account_id: caid }).eq("id", existingMapping);
                  if (updErr) console.error(`Failed to update client_account_id for ${existingMapping}:`, updErr.message);
                }
                results.skipped = (results.skipped || 0) + 1;
              } else {
                const { data: ins, error: insErr } = await adminClient.from("entity_accounts").insert(row).select("id").single();
                if (insErr) { results.errors.push(`EntityAccount ${legacyId}: ${insErr.message}`); continue; }
                newId = ins.id;
              }
            }

          } else if (table_name === "users") {
            const email = (record.email_address || record.EmailAddress || "").trim().toLowerCase();
            const firstName = val(record.first_name || record.Name) || "";
            const lastName = val(record.last_name || record.Surname) || "";
            const isActive = toBool(record.is_active ?? record.IsActive, true);
            const isDeleted = toBool(record.is_deleted ?? record.IsDeleted, false);
            const membershipActive = !isDeleted && isActive;
            const phoneVerified = toBool(record.phone_verified ?? record.IsPhoneNumberConfirmed, false);
            const emailVerified = toBool(record.email_verified ?? record.IsEmailConfirmed ?? record.IsActive, false);
            console.log(`User ${legacyId} (${email}): is_active=${record.is_active}(${typeof record.is_active}) -> ${isActive}, is_deleted=${record.is_deleted}(${typeof record.is_deleted}) -> ${isDeleted}, membershipActive=${membershipActive}`);
            const regStatus = membershipActive ? "registered" : "incomplete";

            if (!email) { results.errors.push(`User ${legacyId}: missing email`); continue; }

            // If already imported, update status instead of skipping
            if (existing) {
              const existingUserId = existing.new_id;
              results.simulation.push({ legacy_id: legacyId, action: isDryRun ? "will_update" : "updated", name: `${firstName} ${lastName}`.trim(), mapped_fields: { email, is_active: membershipActive, registration_status: regStatus } });

              if (!isDryRun) {
                await adminClient.from("profiles").update({
                  first_name: firstName || null,
                  last_name: lastName || null,
                  phone: val(record.phone_number || record.PhoneNumber),
                  registration_status: regStatus,
                  phone_verified: phoneVerified,
                  email_verified: emailVerified,
                }).eq("user_id", existingUserId);

                await adminClient.from("tenant_memberships").update({
                  is_active: membershipActive,
                }).eq("user_id", existingUserId).eq("tenant_id", tenant_id);
              }
              results.inserted++;
              continue;
            }

            results.simulation.push({ legacy_id: legacyId, action: isDryRun ? "will_insert" : "insert", name: `${firstName} ${lastName}`.trim(), mapped_fields: { email, firstName, lastName, is_active: membershipActive } });

            if (!isDryRun) {
              // Create auth user with confirmed email
              const { data: authData, error: authErr } = await adminClient.auth.admin.createUser({
                email,
                email_confirm: true,
                password: crypto.randomUUID(),
                user_metadata: { first_name: firstName, last_name: lastName },
              });

              if (authErr) {
                if (authErr.message?.includes("already been registered") || authErr.message?.includes("already exists")) {
                  // Paginate through all users to find the existing one
                  let found: any = null;
                  let page = 1;
                  const perPage = 1000;
                  while (!found) {
                    const { data: listData } = await adminClient.auth.admin.listUsers({ page, perPage });
                    if (!listData?.users?.length) break;
                    found = listData.users.find((u: any) => u.email?.toLowerCase() === email);
                    if (listData.users.length < perPage) break;
                    page++;
                  }
                  if (found) {
                    newId = found.id;
                    results.simulation[results.simulation.length - 1].action = "existing_user";
                  } else {
                    results.errors.push(`User ${legacyId} (${email}): ${authErr.message}`);
                    continue;
                  }
                } else {
                  results.errors.push(`User ${legacyId} (${email}): ${authErr.message}`);
                  continue;
                }
              } else {
                newId = authData.user.id;
              }

              if (newId) {
                await adminClient.from("profiles").update({
                  first_name: firstName || null,
                  last_name: lastName || null,
                  phone: val(record.phone_number || record.PhoneNumber),
                  registration_status: regStatus,
                  phone_verified: phoneVerified,
                  email_verified: emailVerified,
                }).eq("user_id", newId);

                // Create or update tenant membership with correct is_active
                const { data: tmExists } = await adminClient.from("tenant_memberships")
                  .select("id").eq("user_id", newId).eq("tenant_id", tenant_id).maybeSingle();
                if (tmExists) {
                  await adminClient.from("tenant_memberships").update({
                    is_active: membershipActive,
                  }).eq("id", tmExists.id);
                } else {
                  await adminClient.from("tenant_memberships").insert({
                    user_id: newId, tenant_id, is_active: membershipActive,
                  });
                }

                // Create user role (full_member)
                const { data: roleExists } = await adminClient.from("user_roles")
                  .select("id").eq("user_id", newId).eq("role", "full_member").eq("tenant_id", tenant_id).maybeSingle();
                if (!roleExists) {
                  await adminClient.from("user_roles").insert({
                    user_id: newId, role: "full_member", tenant_id,
                  });
                }
              }
            }

          } else if (table_name === "entity_user_relationships") {
            const entityId = await resolveLegacy("entities", record.legacy_entity_id || record.EntityId);
            const relTypeId = await resolveLegacy("relationship_types", record.legacy_relationship_type_id || record.RelationshipTypeId);
            const legacyUserId = record.legacy_user_id || record.UserId;

            if (!entityId) { results.errors.push(`Relationship ${legacyId}: entity not found`); continue; }

            // Resolve user_id from legacy user mapping
            let userId: string | null = null;
            if (legacyUserId && !isNullish(legacyUserId)) {
              userId = await resolveLegacy("users", String(legacyUserId));
            }
            if (!userId) { results.errors.push(`Relationship ${legacyId}: user not found for legacy_user_id ${legacyUserId}`); continue; }

            const row: Record<string, unknown> = {
              tenant_id,
              entity_id: entityId,
              relationship_type_id: relTypeId,
              is_active: record.is_active ?? record.IsActive ?? true,
              user_id: userId,
            };

            results.simulation.push({ legacy_id: legacyId, action: isDryRun ? "will_insert" : "insert", legacy_user_id: legacyUserId, mapped_fields: row });
            if (!isDryRun) {
              const { data: ins, error: insErr } = await adminClient.from("user_entity_relationships").insert(row).select("id").single();
              if (insErr) { results.errors.push(`Relationship ${legacyId}: ${insErr.message}`); continue; }
              newId = ins.id;
            }

          } else if (table_name === "entity_addresses") {
            const entityId = await resolveLegacy("entities", record.legacy_entity_id || record.EntityId);
            if (!entityId) { results.errors.push(`Address ${legacyId}: entity not found`); continue; }

            // Concatenate street address lines
            const lines = [
              val(record.street_address_line1 || record.StreetAddressLine1),
              val(record.street_address_line2 || record.StreetAddressLine2),
              val(record.street_address_line3 || record.StreetAddressLine3),
            ].filter(Boolean);
            const streetAddress = lines.join(", ") || "Unknown";

            // Resolve country
            let country = "South Africa";
            const legacyCountryId = record.legacy_country_id || record.CountryId;
            if (legacyCountryId && !isNullish(legacyCountryId)) {
              const countryId = await resolveLegacy("countries", String(legacyCountryId));
              if (countryId) {
                const { data: countryData } = await adminClient.from("countries").select("name").eq("id", countryId).maybeSingle();
                if (countryData) country = countryData.name;
              }
            }

            const city = val(record.city || record.City) || "Unknown";
            let addressType = "residential";
            const legacyType = String(record.address_type ?? record.AddressType ?? "0");
            if (legacyType === "1" || legacyType.toLowerCase() === "postal") addressType = "postal";
            else if (legacyType === "2" || legacyType.toLowerCase() === "business") addressType = "business";

            const row: Record<string, unknown> = {
              tenant_id, entity_id: entityId, street_address: streetAddress, city,
              suburb: val(record.suburb || record.Suburb),
              province: val(record.province || record.Province),
              postal_code: val(record.postal_code || record.PostalCode),
              country, address_type: addressType,
              latitude: val(record.latitude || record.Latitude),
              longitude: val(record.longitude || record.Longitude),
              is_primary: true,
            };

            results.simulation.push({ legacy_id: legacyId, action: isDryRun ? "will_insert" : "insert", street: streetAddress, mapped_fields: row });
            if (!isDryRun) {
              const { data: ins, error: insErr } = await adminClient.from("addresses").insert(row).select("id").single();
              if (insErr) { results.errors.push(`Address ${legacyId}: ${insErr.message}`); continue; }
              newId = ins.id;
            }
          } else if (table_name === "unit_transactions") {
            // Map UT → unit_transactions table
            // Resolve EntityID → entity_account_id via client_account_id on entity_accounts
            const rawEntityId = String(record.entity_account_id || record.EntityAccountID || record.entity_id || record.EntityID || "");
            const { data: eaMatch } = await adminClient.from("entity_accounts")
              .select("id").eq("tenant_id", tenant_id)
              .eq("client_account_id", Number(rawEntityId)).maybeSingle();
            let entityAccountNewId = eaMatch?.id || null;

            // Fallback: try legacy_id_mappings
            if (!entityAccountNewId) {
              entityAccountNewId = await resolveLegacy("entity_accounts", rawEntityId);
            }
            if (!entityAccountNewId) { results.errors.push(`UT ${legacyId}: entity account not found for client_account_id ${rawEntityId}`); continue; }

            // Look up entity account details for display
            let entityAccountLabel = `EA:${rawEntityId}`;
            const { data: eaInfo } = await adminClient.from("entity_accounts")
              .select("account_number, entities(name, last_name)")
              .eq("id", entityAccountNewId).maybeSingle();
            if (eaInfo) {
              const ent = eaInfo.entities as any;
              const entName = ent ? [ent.name, ent.last_name].filter(Boolean).join(" ") : "";
              entityAccountLabel = [eaInfo.account_number, entName].filter(Boolean).join(" - ") || entityAccountLabel;
            }

            // Resolve pool
            const poolNewId = await resolveLegacy("pools", String(record.pool_id || record.PoolID));
            if (!poolNewId) { results.errors.push(`UT ${legacyId}: pool not found for PoolID ${record.pool_id}`); continue; }

            // Resolve user from PTUserID
            const userNewId = await resolveLegacy("users", String(record.pt_user_id || record.PTUserID));

            const rawUnits = Number(record.units || record.Units || record.value || record.Value || 0);
            const unitPrice = Number(record.unit_price || record.UnitPrice || 0);
            const txDate = record.transaction_date || record.TransactionDate;
            const legacyTxId = String(record.transaction_id || record.TransactionID || "");

            // Determine debit/credit: negative value means credit (outflow),
            // also check transaction type for explicit sell/withdraw patterns
            const rawTxTypeName = String(record.transaction_type || record.TransactionType || "").trim();
            const isCredit = rawUnits < 0 || /withdraw|sell|switch.*out/i.test(rawTxTypeName);
            const units = Math.abs(rawUnits);
            const value = units * unitPrice;

            const row: Record<string, unknown> = {
              tenant_id,
              entity_account_id: entityAccountNewId,
              pool_id: poolNewId,
              user_id: userNewId,
              transaction_date: txDate,
              unit_price: unitPrice,
              debit: isCredit ? 0 : Math.abs(units),
              credit: isCredit ? Math.abs(units) : 0,
              value: Math.abs(value),
              transaction_type: rawTxTypeName,
              legacy_id: String(legacyId),
              legacy_transaction_id: legacyTxId || null,
              notes: `Legacy UT import: Type=${rawTxTypeName}, EntryID=${record.type_transaction_entry_id || record.Type_TransactionEntryID}`,
            };

            // Dedup: skip if legacy_id already exists
            const { data: existingUT } = await adminClient.from("unit_transactions")
              .select("id").eq("tenant_id", tenant_id).eq("legacy_id", String(legacyId)).maybeSingle();
            if (existingUT) {
              results.simulation.push({ legacy_id: legacyId, action: "skip_duplicate", name: `${entityAccountLabel} | ${rawTxTypeName} | Already exists` });
              newId = existingUT.id;
            } else {
              results.simulation.push({ legacy_id: legacyId, action: isDryRun ? "will_insert" : "insert", name: `${entityAccountLabel} | ${rawTxTypeName} | Pool:${record.pool_id || record.PoolID} | Units:${units} | Val:${value}`, mapped_fields: row });
              if (!isDryRun) {
                const { data: ins, error: insErr } = await adminClient.from("unit_transactions").insert(row).select("id").single();
                if (insErr) { results.errors.push(`UT ${legacyId}: ${insErr.message}`); continue; }
                newId = ins.id;
              }
            }

          } else if (table_name === "stock_transactions") {
            // Resolve EntityID → entity_account_id via client_account_id on entity_accounts
            const rawEntityId = String(record.entity_id || record.EntityID || "");
            const { data: eaMatch } = await adminClient.from("entity_accounts")
              .select("id").eq("tenant_id", tenant_id)
              .eq("client_account_id", Number(rawEntityId)).maybeSingle();
            const entityAccountNewId = eaMatch?.id || null;
            if (!entityAccountNewId) { results.errors.push(`Stock ${legacyId}: entity account not found for client_account_id ${rawEntityId}`); continue; }

            // Resolve StockItemID → item_id via items mapping
            const rawItemId = String(record.stock_item_id || record.StockItemID || "");
            const itemNewId = await resolveLegacy("items", rawItemId);

            // Resolve user from PTUserID
            const userNewId = await resolveLegacy("users", String(record.pt_user_id || record.PTUserID || ""));

            // Resolve Type_StockTransactionID and TransactionTypeID from gen_type_values
            const stockTxTypeId = String(record.type_stock_transaction_id || record.Type_StockTransactionID || "");
            let stockTxTypeName: string | null = null;
            if (stockTxTypeId && stockTxTypeId !== "0") {
              const { data: gtv } = await adminClient.from("legacy_id_mappings")
                .select("description").eq("tenant_id", tenant_id)
                .eq("table_name", "gen_type_values").eq("legacy_id", stockTxTypeId).maybeSingle();
              stockTxTypeName = gtv?.description || stockTxTypeId;
            }

            const txTypeId = String(record.transaction_type_id || record.TransactionTypeID || "");
            let txTypeName: string | null = null;
            if (txTypeId && txTypeId !== "0") {
              const { data: gtv } = await adminClient.from("legacy_id_mappings")
                .select("description").eq("tenant_id", tenant_id)
                .eq("table_name", "gen_type_values").eq("legacy_id", txTypeId).maybeSingle();
              txTypeName = gtv?.description || txTypeId;
            }

            // CFT parent linking deferred to reconciliation pass
            const legacyTxId: string | null = null;

            const txDate = record.transaction_date || record.TransactionDate;
            const row: Record<string, unknown> = {
              tenant_id,
              entity_account_id: entityAccountNewId,
              item_id: itemNewId,
              transaction_date: txDate,
              cost_price: Number(record.unit_price || record.UnitPrice || 0),
              total_value: Number(record.total_value || record.TotalValue || 0),
              debit: Number(record.debit || record.Debit || 0),
              credit: Number(record.credit || record.Credit || 0),
              pending: toBool(record.pending || record.Pending, false),
              stock_transaction_type: stockTxTypeName,
              transaction_type: txTypeName,
              user_id: userNewId,
              legacy_transaction_id: legacyTxId,
              notes: `Legacy stock import: StockTxType=${stockTxTypeName}, TxType=${txTypeName}, CFT=${legacyTxId || 'none'}`,
            };

            // Build entity label for display
            let entityLabel = rawEntityId;
            const { data: eaInfo } = await adminClient.from("entity_accounts")
              .select("account_number, entity_id").eq("id", entityAccountNewId).maybeSingle();
            if (eaInfo) entityLabel = eaInfo.account_number || eaInfo.entity_id || rawEntityId;

            results.simulation.push({ legacy_id: legacyId, action: isDryRun ? "will_insert" : "insert", name: `${entityLabel} | ${stockTxTypeName || 'N/A'} | Item:${rawItemId} | Val:${row.total_value} | CFT:${legacyTxId || 'none'}`, mapped_fields: row });
            if (!isDryRun) {
              const { data: ins, error: insErr } = await adminClient.from("stock_transactions").insert(row).select("id").single();
              if (insErr) { results.errors.push(`Stock ${legacyId}: ${insErr.message}`); continue; }
              newId = ins.id;
            }
          } else if (table_name === "daily_stock_prices") {
            // Resolve StockItemID → item_id via items mapping
            const rawItemId = String(record.stock_item_id || record.StockItemID || "");
            const itemNewId = await resolveLegacy("items", rawItemId);

            const priceDate = record.price_date || record.PriceDate;
            const row: Record<string, unknown> = {
              tenant_id,
              item_id: itemNewId,
              price_date: priceDate,
              cost_excl_vat: Number(record.cost_excl_vat || record.CostExclVat || 0),
              cost_incl_vat: Number(record.cost_incl_vat || record.CostInclVat || 0),
              buy_price_excl_vat: Number(record.buy_price_excl_vat || record.BuyPriceExclVat || 0),
              buy_price_incl_vat: Number(record.buy_price_incl_vat || record.BuyPriceInclVat || 0),
              legacy_id: String(legacyId),
              legacy_stock_item_id: rawItemId,
            };

            results.simulation.push({ legacy_id: legacyId, action: isDryRun ? "will_insert" : "insert", name: `Item:${rawItemId} | Date:${priceDate} | Buy:${row.buy_price_excl_vat}`, mapped_fields: row });
            if (!isDryRun) {
              const { data: ins, error: insErr } = await adminClient.from("daily_stock_prices").insert(row).select("id").single();
              if (insErr) { results.errors.push(`DailyPrice ${legacyId}: ${insErr.message}`); continue; }
              newId = ins.id;
            }
          } else if (table_name === "daily_pool_prices") {
            // Resolve PoolID → pool_id via pools mapping
            const rawPoolId = String(record.pool_id || record.PoolID || "");
            const poolNewId = await resolveLegacy("pools", rawPoolId);

            const totalsDate = record.totals_date || record.TotalsDate;
            const row: Record<string, unknown> = {
              tenant_id,
              pool_id: poolNewId,
              totals_date: totalsDate,
              total_stock: Number(record.total_stock || record.TotalStock || 0),
              total_units: Number(record.total_units || record.TotalUnits || 0),
              cash_control: Number(record.cash_control || record.CashBalance || 0),
              vat_control: Number(record.vat_control || record.VATBalance || 0),
              loan_control: Number(record.loan_control || record.LoanBalance || 0),
              member_interest_buy: Number(record.member_interest_buy || record.MemberInterestIncl || 0),
              member_interest_sell: Number(record.member_interest_sell || record.MemberInterestExcl || 0),
              unit_price_buy: Number(record.unit_price_buy || record.UnitPriceBuy || 0),
              unit_price_sell: Number(record.unit_price_sell || record.UnitPriceSell || 0),
              legacy_id: String(legacyId),
              legacy_pool_id: rawPoolId,
            };

            results.simulation.push({ legacy_id: legacyId, action: isDryRun ? "will_insert" : "insert", name: `Pool:${rawPoolId} | Date:${totalsDate} | Buy:${row.unit_price_buy} | Sell:${row.unit_price_sell}`, mapped_fields: row });
            if (!isDryRun) {
              const { data: ins, error: insErr } = await adminClient.from("daily_pool_prices").insert(row).select("id").single();
              if (insErr) { results.errors.push(`PoolPrice ${legacyId}: ${insErr.message}`); continue; }
              newId = ins.id;
            }
          } else if (table_name === "entity_banks") {
            // Debug: log record keys for first record to diagnose field naming
            if (results.inserted === 0 && results.skipped === 0 && results.errors.length === 0) {
              console.log("entity_banks first record keys:", Object.keys(record));
              console.log("entity_banks first record sample:", JSON.stringify(record).slice(0, 500));
            }
            const entityId = await resolveLegacy("entities", record.legacy_entity_id || record.EntityId || record["EntityId"]);
            if (!entityId) { results.errors.push(`EntityBank ${legacyId}: entity not found for legacy_entity_id`); continue; }

            // Resolve BankId via legacy_id_mappings, then fallback to name match
            let bankId = await resolveLegacy("banks", record.legacy_bank_id || record.BankId || record["BankId"]);
            if (!bankId) {
              // Fallback: match by bank name from the joined query
              const bankName = record.bank_name || record.BankName;
              if (bankName) {
                const { data: nameMatch } = await adminClient.from("banks").select("id").ilike("name", String(bankName).trim()).maybeSingle();
                if (nameMatch) bankId = nameMatch.id;
              }
            }
            if (!bankId) { results.errors.push(`EntityBank ${legacyId}: bank not found for legacy_bank_id=${record.legacy_bank_id}, name=${record.bank_name}`); continue; }

            // Resolve BankAccountTypeId via legacy_id_mappings, then fallback to name match
            let bankAccountTypeId = await resolveLegacy("bank_account_types", record.legacy_bank_account_type_id || record.BankAccountTypeId);
            if (!bankAccountTypeId) {
              const batName = record.bank_account_type_name || record.BankAccountTypeName;
              if (batName) {
                const { data: nameMatch } = await adminClient.from("bank_account_types").select("id").ilike("name", String(batName).trim()).maybeSingle();
                if (nameMatch) bankAccountTypeId = nameMatch.id;
              }
            }
            if (!bankAccountTypeId) { results.errors.push(`EntityBank ${legacyId}: bank account type not found for id=${record.legacy_bank_account_type_id}, name=${record.bank_account_type_name}`); continue; }

            const row: Record<string, unknown> = {
              tenant_id,
              entity_id: entityId,
              bank_id: bankId,
              bank_account_type_id: bankAccountTypeId,
              account_holder: val(record.holder || record.Holder) || "Unknown",
              account_number: val(record.account_number || record.AccountNumber) || "",
              is_active: toBool(record.is_active ?? record.IsActive, true),
              is_deleted: toBool(record.is_deleted ?? record.IsDeleted, false),
              deletion_time: val(record.deletion_time || record.DeletionTime),
            };

            results.simulation.push({ legacy_id: legacyId, action: isDryRun ? "will_insert" : "insert", name: `${row.account_holder} | ${row.account_number}`, mapped_fields: row });
            if (!isDryRun) {
              const { data: ins, error: insErr } = await adminClient.from("entity_bank_details").insert(row).select("id").single();
              if (insErr) { results.errors.push(`EntityBank ${legacyId}: ${insErr.message}`); continue; }
              newId = ins.id;
            }
          } else if (table_name === "document_entity_requirements") {
            const docTypeId = await resolveLegacy("document_types", record.legacy_document_type_id || record.DocumentTypeId);
            const relTypeId = await resolveLegacy("relationship_types", record.legacy_relationship_type_id || record.RelationshipTypeId);

            if (!docTypeId) { results.errors.push(`DocReq ${legacyId}: document_type not found for legacy id ${record.legacy_document_type_id || record.DocumentTypeId}`); continue; }
            if (!relTypeId) { results.errors.push(`DocReq ${legacyId}: relationship_type not found for legacy id ${record.legacy_relationship_type_id || record.RelationshipTypeId}`); continue; }

            // Check for existing requirement with same doc type + rel type combo
            const { data: existingReq } = await adminClient.from("document_entity_requirements")
              .select("id")
              .eq("tenant_id", tenant_id)
              .eq("document_type_id", docTypeId)
              .eq("relationship_type_id", relTypeId)
              .maybeSingle();

            if (existingReq) {
              results.simulation.push({ legacy_id: legacyId, action: "skip_duplicate", doc_type: docTypeId, rel_type: relTypeId });
              newId = existingReq.id;
              results.skipped++;
              // Still store legacy mapping below
            } else {
              const row: Record<string, unknown> = {
                tenant_id,
                document_type_id: docTypeId,
                relationship_type_id: relTypeId,
                is_required_for_registration: toBool(record.is_required_for_registration ?? record.IsRequiredForRegistration, false),
                is_active: toBool(record.is_active ?? record.IsActive, true),
              };

              results.simulation.push({ legacy_id: legacyId, action: isDryRun ? "will_insert" : "insert", mapped_fields: row });
              if (!isDryRun) {
                const { data: ins, error: insErr } = await adminClient.from("document_entity_requirements").insert(row).select("id").single();
                if (insErr) { results.errors.push(`DocReq ${legacyId}: ${insErr.message}`); continue; }
                newId = ins.id;
              }
            }
          } else if (table_name === "entity_documents") {
            const entityId = await resolveLegacy("entities", record.legacy_entity_id || record.EntityId);
            const docTypeId = await resolveLegacy("document_types", record.legacy_document_type_id || record.DocumentTypeId);

            if (!entityId) { results.errors.push(`EntityDoc ${legacyId}: entity not found for legacy id ${record.legacy_entity_id || record.EntityId}`); continue; }

            // Build the document record - file_path uses the legacy DocumentId as a reference
            const legacyDocumentId = record.DocumentId || record.document_id || "";
            const fileName = record.FileName || record.file_name || "unknown";
            const description = record.Description || record.description || "";
            const documentDate = record.DocumentDate || record.document_date || null;
            const isActive = toBool(record.is_active ?? record.IsActive, true);
            const isDeleted = toBool(record.is_deleted ?? record.IsDeleted, false);

            // Check for existing document with same entity + filename + description
            const { data: existingDoc } = await adminClient.from("entity_documents")
              .select("id")
              .eq("tenant_id", tenant_id)
              .eq("entity_id", entityId)
              .eq("file_name", fileName)
              .eq("description", description || "")
              .maybeSingle();

            if (existingDoc) {
              results.simulation.push({ legacy_id: legacyId, action: "skip_duplicate", entity_id: entityId, file_name: fileName });
              newId = existingDoc.id;
              results.skipped++;
            } else {
              const row: Record<string, unknown> = {
                tenant_id,
                entity_id: entityId,
                document_type_id: docTypeId || null,
                file_name: fileName,
                file_path: `legacy/${legacyDocumentId}/${fileName}`,
                description: description || null,
                document_date: documentDate ? new Date(documentDate).toISOString() : null,
                is_active: isActive,
                is_deleted: isDeleted,
                legacy_document_id: legacyDocumentId || null,
                legacy_id: String(legacyId),
              };

              results.simulation.push({ legacy_id: legacyId, action: isDryRun ? "will_insert" : "insert", mapped_fields: row });
              if (!isDryRun) {
                const { data: ins, error: insErr } = await adminClient.from("entity_documents").insert(row).select("id").single();
                if (insErr) { results.errors.push(`EntityDoc ${legacyId}: ${insErr.message}`); continue; }
                newId = ins.id;
              }
            }
          } else if (table_name === "agent_house_agents") {
            // Link agent (referrer) to agent house (referral house)
            const rawHouseId = record.legacy_agent_house_id || record.AgentHouseEntityId || record.agent_house_entity_id;
            const rawAgentId = record.legacy_agent_id || record.AgentEntityId || record.agent_entity_id;
            const agentNumber = record.agent_number || record.AgentNumber || null;
            console.log(`AgentHouseAgent ${legacyId}: raw house=${rawHouseId}, raw agent=${rawAgentId}, keys=${Object.keys(record).join(",")}`);

            const agentHouseEntityId = await resolveLegacy("entities", rawHouseId);
            const agentEntityId = await resolveLegacy("entities", rawAgentId);
            console.log(`AgentHouseAgent ${legacyId}: resolved house=${agentHouseEntityId}, agent=${agentEntityId}`);

            if (!agentHouseEntityId) {
              results.errors.push(`AgentHouseAgent ${legacyId}: agent house entity not found for legacy_id ${rawHouseId}`);
              continue;
            }
            if (!agentEntityId) {
              results.errors.push(`AgentHouseAgent ${legacyId}: agent entity not found for legacy_id ${rawAgentId}`);
              continue;
            }

            results.simulation.push({
              legacy_id: legacyId,
              action: isDryRun ? "will_update" : "update",
              name: `Link agent ${agentEntityId} → house ${agentHouseEntityId}`,
              mapped_fields: { agent_entity_id: agentEntityId, agent_house_entity_id: agentHouseEntityId, agent_number: agentNumber },
            });

            if (!isDryRun) {
              // Store the mapping with house info in notes (upsert to handle re-imports)
              const notesJson = JSON.stringify({ agent_entity_id: agentEntityId, house_entity_id: agentHouseEntityId, agent_number: agentNumber });
              const { data: existingMapping } = await adminClient.from("legacy_id_mappings")
                .select("id")
                .eq("tenant_id", tenant_id)
                .eq("table_name", "agent_house_agents")
                .eq("legacy_id", String(legacyId))
                .maybeSingle();
              if (existingMapping) {
                await adminClient.from("legacy_id_mappings")
                  .update({ new_id: agentEntityId, notes: notesJson, import_batch: batchId })
                  .eq("id", existingMapping.id);
              } else {
                await adminClient.from("legacy_id_mappings").insert({
                  tenant_id, table_name: "agent_house_agents", legacy_id: String(legacyId),
                  new_id: agentEntityId, import_batch: batchId, notes: notesJson,
                });
              }
              results.inserted++;
            }
            continue; // Skip the default legacy_id_mapping insert at the bottom
          } else if (table_name === "referrers") {
            // Create referrer records from agent_house_agents legacy data
            // This table doesn't use individual records from the request — it processes all agent_house_agents mappings
            // We expect a single dummy record to trigger the batch process
            if (i > 0) { results.skipped++; continue; } // Only process once

            // Fetch all agent_house_agents mappings
            const { data: agentMappings } = await adminClient.from("legacy_id_mappings")
              .select("legacy_id, new_id, notes")
              .eq("tenant_id", tenant_id)
              .eq("table_name", "agent_house_agents");

            if (!agentMappings || agentMappings.length === 0) {
              results.errors.push("No agent_house_agents mappings found. Import Agent House Agents first.");
              continue;
            }

            // Find account type 5 (Referral House) once
            const { data: rhType } = await adminClient.from("entity_account_types")
              .select("id")
              .eq("tenant_id", tenant_id)
              .eq("account_type", 5)
              .limit(1);
            const rhTypeId = rhType?.[0]?.id;

            // Process each agent mapping
            for (const mapping of agentMappings) {
              const agentEntityId = mapping.new_id; // new_id = agent entity ID
              if (!agentEntityId) continue;

              // Parse house entity ID from notes (stored as JSON by updated agent_house_agents import)
              let houseEntityId: string | null = null;
              let agentNumber: string | null = null;
              try {
                const notesData = JSON.parse(mapping.notes || "{}");
                houseEntityId = notesData.house_entity_id || null;
                agentNumber = notesData.agent_number || null;
              } catch {
                // Old format notes — try to get house from entity field
                console.log(`Mapping ${mapping.legacy_id}: notes not JSON, falling back to entity lookup`);
              }

              // Fallback: check agent entity's agent_house_agent_id
              if (!houseEntityId) {
                const { data: agentEnt } = await adminClient.from("entities")
                  .select("agent_house_agent_id")
                  .eq("id", agentEntityId)
                  .single();
                houseEntityId = agentEnt?.agent_house_agent_id || null;
              }

              if (!houseEntityId) {
                results.errors.push(`Agent ${agentEntityId}: no house entity found in mapping notes or entity field. Re-import Agent House Agents first.`);
                continue;
              }

              // Check if referrer already exists for this entity + house combination
              const { data: existingRef } = await adminClient.from("referrers")
                .select("id")
                .eq("entity_id", agentEntityId)
                .eq("referral_house_entity_id", houseEntityId)
                .eq("tenant_id", tenant_id)
                .limit(1);
              if (existingRef && existingRef.length > 0) {
                results.skipped++;
                console.log(`Referrer already exists for entity ${agentEntityId} → house ${houseEntityId}`);
                // Still update member entities to point to this referrer
                const refId = existingRef[0].id;
                await adminClient.from("entities")
                  .update({ agent_house_agent_id: refId })
                  .eq("agent_house_agent_id", agentEntityId)
                  .eq("tenant_id", tenant_id);
                continue;
              }

              // Get the agent entity name
              const { data: agentEntity } = await adminClient.from("entities")
                .select("id, name, last_name")
                .eq("id", agentEntityId)
                .single();
              if (!agentEntity) {
                results.errors.push(`Agent entity ${agentEntityId} not found`);
                continue;
              }

              // Find the Referral House account for the house entity
              const { data: houseAccounts } = await adminClient.from("entity_accounts")
                .select("id, entity_account_type_id, account_number")
                .eq("entity_id", houseEntityId)
                .eq("tenant_id", tenant_id);

              const houseAccount = houseAccounts?.find((a: any) => a.entity_account_type_id === rhTypeId);
              
              if (!houseAccount) {
                results.errors.push(`No Referral House account found for house entity ${houseEntityId}`);
                continue;
              }

              // Find the user linked to the agent entity (if any)
              const { data: userRels } = await adminClient.from("user_entity_relationships")
                .select("user_id")
                .eq("entity_id", agentEntityId)
                .eq("tenant_id", tenant_id)
                .eq("is_active", true)
                .limit(1);
              const userId = userRels?.[0]?.user_id ?? null;

              // Use agent_number from legacy data or generate sequential number
              const houseAcctNumber = houseAccount.account_number;
              let referrerNumber: string;
              if (agentNumber) {
                referrerNumber = houseAcctNumber ? `${houseAcctNumber}/${agentNumber}` : `REF-${agentNumber}`;
              } else {
                const { count: existingCount } = await adminClient.from("referrers")
                  .select("id", { count: "exact", head: true })
                  .eq("referral_house_entity_id", houseEntityId)
                  .eq("tenant_id", tenant_id);
                const seqNum = String((existingCount ?? 0) + 1).padStart(2, "0");
                referrerNumber = houseAcctNumber ? `${houseAcctNumber}/${seqNum}` : `REF-${seqNum}`;
              }

              const agentName = [agentEntity.name, agentEntity.last_name].filter(Boolean).join(" ");
              
              results.simulation.push({
                legacy_id: mapping.legacy_id,
                action: isDryRun ? "will_create" : "create",
                name: `Referrer: ${agentName} → ${referrerNumber}`,
                mapped_fields: { entity_id: agentEntityId, house_entity_id: houseEntityId, referrer_number: referrerNumber },
              });

              if (!isDryRun) {
                const { data: newRef, error: refErr } = await adminClient.from("referrers").insert({
                  entity_id: agentEntityId,
                  user_id: userId,
                  referral_house_entity_id: houseEntityId,
                  referral_house_account_id: houseAccount.id,
                  referrer_number: referrerNumber,
                  tenant_id: tenant_id,
                  status: "approved",
                  approved_at: new Date().toISOString(),
                  is_active: true,
                }).select("id").single();

                if (refErr) {
                  results.errors.push(`Referrer ${agentName}: ${refErr.message}`);
                  continue;
                }

                // Update member entities: change agent_house_agent_id from agent entity ID to referrer record ID
                const { error: updateErr } = await adminClient.from("entities")
                  .update({ agent_house_agent_id: newRef.id })
                  .eq("agent_house_agent_id", agentEntityId)
                  .eq("tenant_id", tenant_id);
                if (updateErr) {
                  console.log(`Warning: failed to update member links for referrer ${newRef.id}: ${updateErr.message}`);
                }

                newId = newRef.id;
                console.log(`Created referrer ${referrerNumber} for ${agentName}, id=${newRef.id}`);
              }
              results.inserted++;
            }
            continue; // Skip the normal legacy_id_mapping insert

          // Store legacy_id_mappings for all tables including entity_accounts (needed for shares resolution)
          if (!isDryRun && newId) {
            await adminClient.from("legacy_id_mappings").insert({
              tenant_id, table_name, legacy_id: String(legacyId), new_id: newId,
              import_batch: batchId, notes: `Imported from legacy`,
            });
          }
          results.inserted++;
        } catch (recErr: any) {
          results.errors.push(`Record error: ${recErr.message}`);
        }
      }

      return new Response(JSON.stringify({ success: true, batch: batchId, ...results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const config = TABLE_CONFIGS[table_name];
    if (!config) {
      throw new Error(`Unsupported table: ${table_name}. Supported: ${[...Object.keys(GLOBAL_TABLE_CONFIGS), ...Object.keys(TABLE_CONFIGS), ...CUSTOM_TABLES].join(", ")}`);
    }

    // Verify user has admin role for this tenant
    const { data: roleCheck } = await adminClient.rpc("has_tenant_role", {
      _user_id: user.id,
      _role: "tenant_admin",
      _tenant_id: tenant_id,
    });
    const { data: superCheck } = await adminClient.rpc("has_role", {
      _user_id: user.id,
      _role: "super_admin",
    });
    if (!roleCheck && !superCheck) throw new Error("Insufficient permissions");

    const results = { inserted: 0, skipped: 0, errors: [] as string[], dry_run: isDryRun, simulation: [] as Record<string, unknown>[] };
    const batchId = import_batch || `import_${Date.now()}`;

    for (const record of records) {
      try {
        const legacyId = record.legacy_id || record.id || record.Id || record.ID;
        if (!legacyId) {
          results.errors.push(`Record missing legacy_id: ${JSON.stringify(record).slice(0, 100)}`);
          continue;
        }

        // Check if already imported via legacy mapping
        const { data: existing } = await adminClient
          .from("legacy_id_mappings")
          .select("new_id")
          .eq("tenant_id", tenant_id)
          .eq("table_name", table_name)
          .eq("legacy_id", String(legacyId))
          .maybeSingle();

        if (existing) {
          results.skipped++;
          continue;
        }

        // Also check for name-based duplicates in the target table
        const nameValue = record[config.nameField] 
          ?? record[toPascalCase(config.nameField)] 
          ?? record[toCamelCase(config.nameField)];
        if (nameValue) {
          const { data: nameMatch } = await adminClient
            .from(table_name)
            .select("id")
            .eq("tenant_id", tenant_id)
            .eq(config.nameField, String(nameValue))
            .maybeSingle();
          if (nameMatch) {
            results.simulation.push({ legacy_id: legacyId, action: "skip_name_match", name: nameValue, matched_id: nameMatch.id });
            if (!isDryRun) {
              await adminClient.from("legacy_id_mappings").insert({
                tenant_id,
                table_name,
                legacy_id: String(legacyId),
                new_id: nameMatch.id,
                import_batch: batchId,
                notes: `Matched existing by ${config.nameField}: ${nameValue}`,
              });
            }
            results.skipped++;
            continue;
          }
        }

        // Build the row to insert — all remaining tables are tenant-specific
        const row: Record<string, unknown> = { tenant_id };

        // Fields that are resolved via FK mapping — must NOT be set by generic mapper
        const fkFields = new Set(["pool_id", "tax_type_id", "entity_account_id", "debit_control_account_id", "credit_control_account_id"]);

        // Legacy field name aliases for tables with non-standard naming
        const fieldAliases: Record<string, string[]> = table_name === "income_expense_items" ? {
          item_code: ["ExpenseCode", "expenseCode"],
          recurrence_type: ["Frequency", "frequency"],
          amount: ["FixedAmount", "fixedAmount"],
          percentage: ["PoolValuePerc", "poolValuePerc"],
          vat: ["VAT"],
          bankflow: ["Bankflow"],
          extra1: ["Extra1"],
        } : table_name === "control_accounts" ? {
          account_type: ["Type", "type", "AccountType", "ControlAccountType", "controlAccountType"],
        } : {};

        // Map fields - handle legacy field name variations
        for (const field of [...config.required, ...config.optional]) {
          if (fkFields.has(field)) continue; // skip FK fields, resolved below
          const aliases = fieldAliases[field] || [];
          const value = record[field] 
            ?? record[toPascalCase(field)] 
            ?? record[toCamelCase(field)]
            ?? aliases.reduce((v: unknown, alias: string) => v ?? record[alias], undefined as unknown);
          // Treat string "NULL", "null", empty strings as actual null
          const isNullish = value === undefined || value === null 
            || String(value).toUpperCase() === "NULL" || String(value).trim() === "";
          if (!isNullish) {
            row[field] = value;
          }
        }

        // Normalize recurrence_type for income_expense_items: 12 = monthly, anything else = ad_hoc
        if (table_name === "income_expense_items" && row.recurrence_type !== undefined) {
          const freq = String(row.recurrence_type).trim().toLowerCase();
          if (freq === "12" || freq === "monthly") {
            row.recurrence_type = "monthly";
          } else {
            row.recurrence_type = "ad_hoc";
          }
        }

        // Infer account_type for control_accounts if missing
        if (table_name === "control_accounts" && !row.account_type) {
          const n = String(row.name || "").toLowerCase();
          if (n.includes("cash")) row.account_type = "cash";
          else if (n.includes("vat")) row.account_type = "vat";
          else if (n.includes("loan")) row.account_type = "loan";
          else if (n.includes("stock")) row.account_type = "stock";
          else if (n.includes("unit")) row.account_type = "unit";
          else if (n.includes("interest")) row.account_type = "interest";
          else if (n.includes("commission")) row.account_type = "commission";
          else row.account_type = "cash"; // safe default
        }
        // Normalize numeric account_type values for control_accounts
        if (table_name === "control_accounts" && row.account_type !== undefined) {
          const at = String(row.account_type).trim().toLowerCase();
          if (at === "0") row.account_type = "cash";
          else if (at === "1") row.account_type = "vat";
          else if (at === "2") row.account_type = "loan";
        }

        if (table_name === "items" || table_name === "control_accounts") {
          const legacyPoolId = record.legacy_pool_id || record.PoolId || record.poolId || record.PoolID;
          if (legacyPoolId) {
            const { data: mapped } = await adminClient
              .from("legacy_id_mappings")
              .select("new_id")
              .eq("tenant_id", tenant_id)
              .eq("table_name", "pools")
              .eq("legacy_id", String(legacyPoolId))
              .maybeSingle();
            if (mapped) row.pool_id = mapped.new_id;
          }
        }

        // Resolve tax_type_id for items & income_expense_items: try legacy mapping, then name match
        if (table_name === "items" || table_name === "income_expense_items") {
          const legacyTaxId = record.legacy_tax_type_id || record.TaxTypeId || record.taxTypeId;
          if (legacyTaxId) {
            const { data: mapped } = await adminClient
              .from("legacy_id_mappings")
              .select("new_id")
              .eq("tenant_id", tenant_id)
              .eq("table_name", "tax_types")
              .eq("legacy_id", String(legacyTaxId))
              .maybeSingle();
            if (mapped) {
              row.tax_type_id = mapped.new_id;
            } else {
              const taxName = record.tax_type_name || record.TaxTypeName;
              if (taxName) {
                const { data: taxMatch } = await adminClient
                  .from("tax_types")
                  .select("id")
                  .ilike("name", String(taxName))
                  .maybeSingle();
                if (taxMatch) row.tax_type_id = taxMatch.id;
              }
            }
          }
        }

        // Resolve debit/credit control account IDs for income_expense_items
        if (table_name === "income_expense_items") {
          for (const caField of ["debit_control_account_id", "credit_control_account_id"] as const) {
            const legacyKey = caField === "debit_control_account_id"
              ? (record.legacy_debit_ca_id || record.DebitControlAccountId || record.debitControlAccountId || record.AccountDebit)
              : (record.legacy_credit_ca_id || record.CreditControlAccountId || record.creditControlAccountId || record.AccountCredit);
            if (legacyKey) {
              const { data: mapped } = await adminClient
                .from("legacy_id_mappings")
                .select("new_id")
                .eq("tenant_id", tenant_id)
                .eq("table_name", "control_accounts")
                .eq("legacy_id", String(legacyKey))
                .maybeSingle();
              if (mapped) row[caField] = mapped.new_id;
            }
          }
        }

        // Resolve entity_account_id for member_shares via client_account_id
        if (table_name === "member_shares") {
          const legacyEaId = String(record.EntityID || record.legacy_entity_id || record.entityId || "");
          if (legacyEaId) {
            // Primary: EntityID is the member number → match client_account_id
            const numericId = Number(legacyEaId);
            if (!isNaN(numericId)) {
              const { data: clientMatch } = await adminClient
                .from("entity_accounts")
                .select("id")
                .eq("tenant_id", tenant_id)
                .eq("client_account_id", numericId)
                .maybeSingle();
              if (clientMatch) {
                row.entity_account_id = clientMatch.id;
              }
            }
            // Fallback: try legacy_id_mappings (GUID match)
            if (!row.entity_account_id) {
              const eaNewId = await resolveLegacy("entity_accounts", legacyEaId);
              if (eaNewId) {
                row.entity_account_id = eaNewId;
              }
            }
            if (!row.entity_account_id) {
              console.log(`Shares ${legacyId}: FAILED to resolve entity_account for legacy EntityID ${legacyEaId}`);
            }
          }
        }

        // Normalize member_shares: ensure quantity is integer, negative value → negative quantity
        // Also resolve share_class_id to "Join Share" and set value to price_per_share
        if (table_name === "member_shares") {
          const val = Number(row.value ?? 0);
          let qty = Math.round(Number(row.quantity ?? 0)); // force integer
          if (val < 0 && qty > 0) qty = -qty;
          row.quantity = qty;

          // Auto-assign Join Share class and override value to R1
          const { data: joinShareClass } = await adminClient
            .from("share_classes")
            .select("id, price_per_share")
            .eq("tenant_id", tenant_id)
            .eq("name", "Join Share")
            .eq("is_active", true)
            .maybeSingle();
          if (joinShareClass) {
            row.share_class_id = joinShareClass.id;
            row.value = joinShareClass.price_per_share; // R1
          }
          row.membership_type = "full";
        }

        // Validate required fields
        const missing = config.required.filter((f) => !row[f]);
        if (missing.length > 0) {
          results.errors.push(`Record ${legacyId}: missing required fields: ${missing.join(", ")}`);
          results.simulation.push({ legacy_id: legacyId, action: "error", reason: `Missing: ${missing.join(", ")}`, mapped_fields: row });
          continue;
        }

        // Build simulation entry showing mapped fields
        const simEntry: Record<string, unknown> = { 
          legacy_id: legacyId, 
          action: "insert", 
          mapped_fields: { ...row },
        };

        if (isDryRun) {
          // For control accounts, show what would happen
          if (table_name === "control_accounts" && row.pool_id && row.account_type) {
            let accountType = String(row.account_type).toLowerCase();
            if (accountType === "0" || accountType === "cash") accountType = "cash";
            else if (accountType === "1" || accountType === "vat") accountType = "vat";
            else if (accountType === "2" || accountType === "loan" || accountType === "loans") accountType = "loan";

            const { data: existingCA } = await adminClient
              .from("control_accounts")
              .select("id")
              .eq("tenant_id", tenant_id)
              .eq("pool_id", row.pool_id)
              .eq("account_type", accountType)
              .maybeSingle();

            simEntry.action = existingCA ? "update_existing" : "insert";
            simEntry.mapped_fields = { ...row, account_type: accountType };
            if (existingCA) simEntry.existing_id = existingCA.id;
          }

          results.simulation.push(simEntry);
          results.inserted++;
          continue;
        }

        let newId: string;

        // Special handling for control_accounts: match to trigger-created CAs by pool_id + account_type
        if (table_name === "control_accounts" && row.pool_id && row.account_type) {
          let accountType = String(row.account_type).toLowerCase();
          if (accountType === "0" || accountType === "cash") accountType = "cash";
          else if (accountType === "1" || accountType === "vat") accountType = "vat";
          else if (accountType === "2" || accountType === "loan" || accountType === "loans") accountType = "loan";

          const { data: existingCA } = await adminClient
            .from("control_accounts")
            .select("id")
            .eq("tenant_id", tenant_id)
            .eq("pool_id", row.pool_id)
            .eq("account_type", accountType)
            .maybeSingle();

          if (existingCA) {
            await adminClient
              .from("control_accounts")
              .update({ name: row.name, is_active: row.is_active ?? true })
              .eq("id", existingCA.id);
            newId = existingCA.id;
          } else {
            const { data: inserted, error: insertError } = await adminClient
              .from(table_name)
              .insert({ ...row, account_type: accountType })
              .select("id")
              .single();
            if (insertError) {
              results.errors.push(`Record ${legacyId}: ${insertError.message}`);
              continue;
            }
            newId = inserted.id;
          }
        } else {
          const { data: inserted, error: insertError } = await adminClient
            .from(table_name)
            .insert(row)
            .select("id")
            .single();
          if (insertError) {
            // Handle unique constraint violations by finding and mapping the existing record
            if (insertError.message.includes("duplicate key") && row[config.nameField]) {
              const { data: existingMatch } = await adminClient
                .from(table_name)
                .select("id")
                .eq("tenant_id", tenant_id)
                .eq(config.nameField, row[config.nameField])
                .maybeSingle();
              if (existingMatch) {
                newId = existingMatch.id;
                results.skipped++;
                // Still create legacy mapping for the duplicate
                await adminClient.from("legacy_id_mappings").insert({
                  tenant_id,
                  table_name,
                  legacy_id: String(legacyId),
                  new_id: existingMatch.id,
                  import_batch: batchId,
                  notes: `Mapped duplicate ${config.nameField}: ${row[config.nameField]}`,
                });
                continue;
              }
            }
            results.errors.push(`Record ${legacyId}: ${insertError.message}`);
            continue;
          }
          newId = inserted.id;
        }

        // Auto-generate membership fee transaction after member_shares insert
        if (table_name === "member_shares" && newId) {
          try {
            // Find the "Admin" pool for this tenant
            const { data: adminPool } = await adminClient
              .from("pools")
              .select("id")
              .eq("tenant_id", tenant_id)
              .eq("name", "Admin")
              .eq("is_active", true)
              .maybeSingle();

            // Find the "Membership Fee" transaction type for this tenant
            const { data: membershipFeeType } = await adminClient
              .from("transaction_types")
              .select("id")
              .eq("tenant_id", tenant_id)
              .eq("code", "MEMBERSHIP_FEE")
              .maybeSingle();

            if (adminPool && membershipFeeType && row.entity_account_id) {
              // Resolve user_id from entity_account -> entity -> user_entity_relationships
              const { data: ea } = await adminClient
                .from("entity_accounts")
                .select("entity_id")
                .eq("id", row.entity_account_id)
                .maybeSingle();

              if (ea) {
                const { data: uer } = await adminClient
                  .from("user_entity_relationships")
                  .select("user_id")
                  .eq("entity_id", ea.entity_id)
                  .eq("is_active", true)
                  .maybeSingle();

                if (uer) {
                  // Calculate membership fee: original legacy value minus share price (R1)
                  const originalValue = Number(record.Value || record.value || 0);
                  const membershipFee = Math.abs(originalValue) - 1; // legacy was R200, share is R1, fee is R199

                  if (membershipFee > 0) {
                    await adminClient.from("transactions").insert({
                      tenant_id,
                      pool_id: adminPool.id,
                      transaction_type_id: membershipFeeType.id,
                      user_id: uer.user_id,
                      entity_account_id: row.entity_account_id,
                      amount: membershipFee,
                      net_amount: membershipFee,
                      fee_amount: 0,
                      unit_price: 0,
                      units: 0,
                      status: "approved",
                      transaction_date: row.transaction_date,
                      notes: `Legacy membership joining fee - auto-generated from share import (original value: R${Math.abs(originalValue)})`,
                    });
                  }
                }
              }
            }
          } catch (feeErr: any) {
            // Non-fatal: log but don't fail the share import
            results.errors.push(`Fee generation for share ${legacyId}: ${feeErr.message}`);
          }
        }
        // Store legacy mapping
        await adminClient.from("legacy_id_mappings").insert({
          tenant_id,
          table_name,
          legacy_id: String(legacyId),
          new_id: newId,
          import_batch: batchId,
          notes: `Imported ${config.nameField}: ${row[config.nameField] || legacyId}`,
        });

        results.inserted++;
      } catch (recErr: any) {
        results.errors.push(`Record error: ${recErr.message}`);
      }
    }

    return new Response(JSON.stringify({ success: true, batch: batchId, ...results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function toPascalCase(s: string): string {
  return s.replace(/(^|_)(\w)/g, (_, __, c) => c.toUpperCase());
}

function toCamelCase(s: string): string {
  const pascal = toPascalCase(s);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}
