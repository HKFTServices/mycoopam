import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SOURCE_TENANT_ID = "38e204c4-829f-4544-ab53-b2f3f5342662"; // AEM

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, tenant_id, selected_pool_ids, custom_pools, entity_account_type_prefixes, logo_url, logo_data, logo_file_name, logo_mime_type, admin_details, admin_documents, registration_number, sla_fee_plan_id, sla_signature, coop_details } = body;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // ─── List pools action (no auth required, read-only) ───
    if (action === "list_pools") {
      const { data: pools, error } = await admin
        .from("pools")
        .select("id, name, description")
        .eq("tenant_id", SOURCE_TENANT_ID)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return new Response(
        JSON.stringify({ pools: pools ?? [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── List reference data for registration wizard ───
    if (action === "list_reference_data") {
      const [titlesRes, countriesRes, banksRes, bankAccountTypesRes, termsRes, docReqsRes] = await Promise.all([
        admin.from("titles").select("id, description").eq("is_active", true).order("description"),
        admin.from("countries").select("id, name, iso_code").eq("is_active", true).order("name"),
        admin.from("banks").select("id, name, branch_code, country_id").eq("is_active", true).order("name"),
        admin.from("bank_account_types").select("id, name").eq("is_active", true).order("name"),
        admin.from("terms_conditions").select("id, condition_type, language_code, content")
          .eq("tenant_id", SOURCE_TENANT_ID).eq("is_active", true).eq("condition_type", "registration").eq("language_code", "en"),
        admin.from("document_entity_requirements")
          .select("id, document_type_id, relationship_type_id, is_required_for_registration, document_types!inner(id, name)")
          .eq("tenant_id", SOURCE_TENANT_ID).eq("is_active", true).eq("is_required_for_registration", true),
      ]);

      // Filter doc requirements to natural person "Myself" relationship type and deduplicate by document_type_id
      const { data: relTypes } = await admin
        .from("relationship_types")
        .select("id, name, entity_category_id, entity_categories!inner(entity_type)")
        .eq("name", "Myself");
      const myselfRel = relTypes?.find((r: any) => r.entity_categories?.entity_type === "natural_person");
      
      let filteredDocReqs = docReqsRes.data ?? [];
      if (myselfRel) {
        filteredDocReqs = filteredDocReqs.filter((r: any) => r.relationship_type_id === myselfRel.id);
      }
      // Deduplicate by document_type_id
      const seen = new Set<string>();
      filteredDocReqs = filteredDocReqs.filter((r: any) => {
        if (seen.has(r.document_type_id)) return false;
        seen.add(r.document_type_id);
        return true;
      });

      return new Response(
        JSON.stringify({
          titles: titlesRes.data ?? [],
          countries: countriesRes.data ?? [],
          banks: banksRes.data ?? [],
          bank_account_types: bankAccountTypesRes.data ?? [],
          terms: termsRes.data ?? [],
          document_requirements: filteredDocReqs,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!tenant_id || !selected_pool_ids || !Array.isArray(selected_pool_ids)) {
      return new Response(
        JSON.stringify({ error: "tenant_id and selected_pool_ids are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── 0. Create admin user via admin API (no default confirmation email) ───
    let createdUserId: string | null = null;
    if (admin_details?.email && admin_details?.password) {
      console.log("[provision-tenant] Creating user via admin API for:", admin_details.email);
      
      const { data: createData, error: createError } = await admin.auth.admin.createUser({
        email: admin_details.email,
        password: admin_details.password,
        email_confirm: false,
        user_metadata: {
          first_name: admin_details.first_name,
          last_name: admin_details.last_name,
        },
      });
      
      if (createError) {
        // Check if user already exists
        if (createError.message?.includes("already been registered") || createError.message?.includes("already exists")) {
          return new Response(
            JSON.stringify({ error: "An account with this email already exists. Please use a different email." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        throw createError;
      }
      
      createdUserId = createData.user.id;
      admin_details.user_id = createdUserId;
      console.log("[provision-tenant] User created:", createdUserId);

      // Confirm the user's email so they can log in
      const { error: confirmErr } = await admin.auth.admin.updateUserById(createdUserId, {
        email_confirm: true,
      });
      if (confirmErr) console.error("[provision-tenant] Email confirm error:", confirmErr);

      // Ensure profile exists (trigger may not always fire)
      const { error: profileErr } = await admin.from("profiles").upsert({
        user_id: createdUserId,
        email: admin_details.email,
        first_name: admin_details.first_name,
        last_name: admin_details.last_name,
        registration_status: "registered",
        needs_onboarding: false,
        phone: admin_details.contact_number || null,
      }, { onConflict: "user_id" });
      if (profileErr) console.error("[provision-tenant] Profile upsert error:", profileErr);

      // Bootstrap tenant admin roles
      const { error: bootstrapError } = await admin.rpc("bootstrap_tenant_admin", {
        p_tenant_id: tenant_id, p_user_id: createdUserId,
      });
      if (bootstrapError) console.error("[provision-tenant] Bootstrap error:", bootstrapError);
    }

    // ID mapping: source_id → new_id for cross-references
    const idMap = new Map<string, string>();
    const results: Record<string, number> = {};

    // Helper: generate UUID
    const uuid = () => crypto.randomUUID();

    // Helper: map an old ID to a new one (or return null)
    const mapId = (oldId: string | null): string | null => {
      if (!oldId) return null;
      return idMap.get(oldId) || null;
    };

    // ─── 1. GL Accounts ───
    const { data: srcGl } = await admin
      .from("gl_accounts")
      .select("*")
      .eq("tenant_id", SOURCE_TENANT_ID);

    if (srcGl && srcGl.length > 0) {
      const glRows = srcGl.map((g: any) => {
        const newId = uuid();
        idMap.set(g.id, newId);
        return {
          id: newId,
          tenant_id: tenant_id,
          code: g.code,
          name: g.name,
          gl_type: g.gl_type,
          default_entry_type: g.default_entry_type,
          entry_type_tag: g.entry_type_tag,
          is_active: g.is_active,
          control_account_id: null,
        };
      });
      const { error } = await admin.from("gl_accounts").insert(glRows);
      if (error) console.error("GL accounts error:", error);
      results.gl_accounts = glRows.length;
    }

    // ─── 2. Tax Types ───
    const { data: srcTax } = await admin
      .from("tax_types")
      .select("*")
      .eq("tenant_id", SOURCE_TENANT_ID);

    if (srcTax && srcTax.length > 0) {
      const taxRows = srcTax.map((t: any) => {
        const newId = uuid();
        idMap.set(t.id, newId);
        return {
          id: newId,
          tenant_id: tenant_id,
          name: t.name,
          percentage: t.percentage,
          description: t.description,
          is_active: t.is_active,
        };
      });
      const { error } = await admin.from("tax_types").insert(taxRows);
      if (error) console.error("Tax types error:", error);
      results.tax_types = taxRows.length;
    }

    // ─── 3. Pools (only selected ones) ───
    const { data: srcPools } = await admin
      .from("pools")
      .select("*")
      .eq("tenant_id", SOURCE_TENANT_ID)
      .in("id", selected_pool_ids);

    if (srcPools && srcPools.length > 0) {
      for (const pool of srcPools) {
        const newPoolId = uuid();
        idMap.set(pool.id, newPoolId);
        const { error } = await admin.from("pools").insert({
          id: newPoolId,
          tenant_id: tenant_id,
          name: pool.name,
          description: pool.description,
          fixed_unit_price: pool.fixed_unit_price,
          open_unit_price: pool.open_unit_price,
          icon_url: pool.icon_url,
          pool_statement_description: pool.pool_statement_description,
          pool_statement_display_type: pool.pool_statement_display_type,
          is_active: pool.is_active,
        });
        if (error) console.error(`Pool ${pool.name} error:`, error);
      }
      results.pools = srcPools.length;

      const { data: newControlAccounts } = await admin
        .from("control_accounts")
        .select("*")
        .eq("tenant_id", tenant_id);

      const { data: srcControlAccounts } = await admin
        .from("control_accounts")
        .select("*")
        .eq("tenant_id", SOURCE_TENANT_ID);

      if (newControlAccounts && srcControlAccounts) {
        for (const srcCa of srcControlAccounts) {
          const newPoolId = mapId(srcCa.pool_id);
          if (!newPoolId) continue;
          const match = newControlAccounts.find(
            (nc: any) => nc.pool_id === newPoolId && nc.account_type === srcCa.account_type
          );
          if (match) {
            idMap.set(srcCa.id, match.id);
          }
        }
        results.control_accounts = newControlAccounts.length;
      }

      if (srcGl) {
        for (const g of srcGl) {
          if (g.control_account_id) {
            const newGlId = idMap.get(g.id);
            const newCaId = mapId(g.control_account_id);
            if (newGlId && newCaId) {
              await admin.from("gl_accounts").update({ control_account_id: newCaId }).eq("id", newGlId);
            }
          }
        }
      }
    }

    // ─── 4. Items ───
    console.log("Provisioning items for pools:", selected_pool_ids, "idMap pool entries:", Array.from(idMap.entries()).filter(([k]) => selected_pool_ids.includes(k)));
    const { data: srcItems, error: srcItemsErr } = await admin
      .from("items")
      .select("*")
      .eq("tenant_id", SOURCE_TENANT_ID)
      .eq("is_deleted", false)
      .in("pool_id", selected_pool_ids);

    if (srcItemsErr) {
      console.error("Failed to fetch source items:", srcItemsErr);
    }
    console.log("Source items found:", srcItems?.length ?? 0, srcItems?.map((i: any) => i.item_code));

    if (srcItems && srcItems.length > 0) {
      const itemRows = srcItems.map((item: any) => {
        const newId = uuid();
        idMap.set(item.id, newId);
        const mappedPoolId = mapId(item.pool_id);
        if (!mappedPoolId) {
          console.error(`WARNING: No pool mapping for item ${item.item_code} (pool_id: ${item.pool_id}). Using source pool_id as fallback.`);
        }
        return {
          id: newId,
          tenant_id: tenant_id,
          item_code: item.item_code,
          description: item.description,
          pool_id: mappedPoolId || item.pool_id,
          is_stock_item: item.is_stock_item,
          is_active: item.is_active,
          margin_percentage: item.margin_percentage,
          sell_margin_percentage: item.sell_margin_percentage,
          show_item_price_on_statement: item.show_item_price_on_statement,
          tax_type_id: mapId(item.tax_type_id),
          api_provider_id: item.api_provider_id,
          api_code: item.api_code,
          api_key: item.api_key,
          api_link: item.api_link,
          calculation_type: item.calculation_type,
          price_formula: item.price_formula,
          use_fixed_price: item.use_fixed_price,
          calculate_price_with_factor: item.calculate_price_with_factor,
        };
      });
      const { error } = await admin.from("items").insert(itemRows);
      if (error) {
        console.error("Items insert error:", JSON.stringify(error));
        // Retry items one-by-one to identify the problematic row
        for (const row of itemRows) {
          const { error: singleErr } = await admin.from("items").insert(row);
          if (singleErr) {
            console.error(`Item ${row.item_code} failed:`, JSON.stringify(singleErr));
          }
        }
      }
      results.items = itemRows.length;

      for (const item of srcItems) {
        if (item.calculate_price_with_item_id) {
          const newItemId = idMap.get(item.id);
          const refId = mapId(item.calculate_price_with_item_id);
          if (newItemId && refId) {
            await admin.from("items").update({ calculate_price_with_item_id: refId }).eq("id", newItemId);
          }
        }
      }
    } else {
      console.warn("No items found to provision. selected_pool_ids:", selected_pool_ids);
    }

    // ─── 5. Transaction Types ───
    const { data: srcTxTypes } = await admin
      .from("transaction_types")
      .select("*")
      .eq("tenant_id", SOURCE_TENANT_ID);

    if (srcTxTypes && srcTxTypes.length > 0) {
      const ttRows = srcTxTypes.map((tt: any) => {
        const newId = uuid();
        idMap.set(tt.id, newId);
        return {
          id: newId,
          tenant_id: tenant_id,
          code: tt.code,
          name: tt.name,
          description: tt.description,
          initiator_role: tt.initiator_role,
          first_approval_role: tt.first_approval_role,
          final_approval_role: tt.final_approval_role,
          is_active: tt.is_active,
        };
      });
      const { error } = await admin.from("transaction_types").insert(ttRows);
      if (error) console.error("Transaction types error:", error);
      results.transaction_types = ttRows.length;
    }

    // ─── 6. Document Types ───
    const { data: srcDocTypes } = await admin
      .from("document_types")
      .select("*")
      .eq("tenant_id", SOURCE_TENANT_ID);

    if (srcDocTypes && srcDocTypes.length > 0) {
      const dtRows = srcDocTypes.map((dt: any) => {
        const newId = uuid();
        idMap.set(dt.id, newId);
        return {
          id: newId,
          tenant_id: tenant_id,
          name: dt.name,
          is_active: dt.is_active,
          template_key: dt.template_key,
          template_file_url: dt.template_file_url,
          comment_instruction: dt.comment_instruction,
        };
      });
      const { error } = await admin.from("document_types").insert(dtRows);
      if (error) console.error("Document types error:", error);
      results.document_types = dtRows.length;
    }

    // ─── 7. Document Entity Requirements ───
    const { data: srcDocReqs } = await admin
      .from("document_entity_requirements")
      .select("*")
      .eq("tenant_id", SOURCE_TENANT_ID);

    if (srcDocReqs && srcDocReqs.length > 0) {
      const drRows = srcDocReqs.map((dr: any) => ({
        id: uuid(),
        tenant_id: tenant_id,
        document_type_id: mapId(dr.document_type_id) || dr.document_type_id,
        relationship_type_id: dr.relationship_type_id,
        is_active: dr.is_active,
        is_required_for_registration: dr.is_required_for_registration,
      }));
      for (let i = 0; i < drRows.length; i += 50) {
        const batch = drRows.slice(i, i + 50);
        const { error } = await admin.from("document_entity_requirements").insert(batch);
        if (error) console.error(`Doc requirements batch ${i} error:`, error);
      }
      results.document_entity_requirements = drRows.length;
    }

    // ─── 8. Entity Account Types ───
    const { data: srcEATypes } = await admin
      .from("entity_account_types")
      .select("*")
      .eq("tenant_id", SOURCE_TENANT_ID);

    if (srcEATypes && srcEATypes.length > 0) {
      const prefixOverrides = entity_account_type_prefixes || {};
      const eatRows = srcEATypes.map((eat: any) => {
        const newId = uuid();
        idMap.set(eat.id, newId);
        const customPrefix = prefixOverrides[String(eat.account_type)];
        return {
          id: newId,
          tenant_id: tenant_id,
          name: eat.name,
          prefix: customPrefix || eat.prefix,
          account_type: eat.account_type,
          allow_public_registration: eat.allow_public_registration,
          is_active: eat.is_active,
          number_count: eat.number_count,
        };
      });
      const { error } = await admin.from("entity_account_types").insert(eatRows);
      if (error) console.error("Entity account types error:", error);
      results.entity_account_types = eatRows.length;
    }

    // ─── 9. Budget Categories ───
    const { data: srcBudget } = await admin
      .from("budget_categories")
      .select("*")
      .eq("tenant_id", SOURCE_TENANT_ID);

    if (srcBudget && srcBudget.length > 0) {
      const bcRows = srcBudget.map((bc: any) => {
        const newId = uuid();
        idMap.set(bc.id, newId);
        return {
          id: newId,
          tenant_id: tenant_id,
          name: bc.name,
          category_type: bc.category_type,
          sort_order: bc.sort_order,
          is_active: bc.is_active,
        };
      });
      const { error } = await admin.from("budget_categories").insert(bcRows);
      if (error) console.error("Budget categories error:", error);
      results.budget_categories = bcRows.length;
    }

    // ─── 10. Communication Templates ───
    const { data: srcTemplates } = await admin
      .from("communication_templates")
      .select("*")
      .eq("tenant_id", SOURCE_TENANT_ID);

    if (srcTemplates && srcTemplates.length > 0) {
      const tplRows = srcTemplates.map((t: any) => {
        const newId = uuid();
        idMap.set(t.id, newId);
        return {
          id: newId,
          tenant_id: tenant_id,
          name: t.name,
          application_event: t.application_event,
          language_code: t.language_code,
          subject: t.subject,
          body_html: t.body_html,
          is_active: t.is_active,
          is_system_default: t.is_system_default,
          is_email_active: t.is_email_active,
          is_sms_active: t.is_sms_active,
          is_push_notification_active: t.is_push_notification_active,
          is_web_app_active: t.is_web_app_active,
          notes: t.notes,
        };
      });
      const { error } = await admin.from("communication_templates").insert(tplRows);
      if (error) console.error("Communication templates error:", error);
      results.communication_templates = tplRows.length;
    }

    // ─── 11. Terms & Conditions ───
    const { data: srcTerms } = await admin
      .from("terms_conditions")
      .select("*")
      .eq("tenant_id", SOURCE_TENANT_ID);

    if (srcTerms && srcTerms.length > 0) {
      const tcRows = srcTerms.map((tc: any) => {
        const newId = uuid();
        idMap.set(tc.id, newId);
        return {
          id: newId,
          tenant_id: tenant_id,
          condition_type: tc.condition_type,
          language_code: tc.language_code,
          content: tc.content,
          effective_from: tc.effective_from,
          is_active: tc.is_active,
        };
      });
      const { error } = await admin.from("terms_conditions").insert(tcRows);
      if (error) console.error("Terms & conditions error:", error);
      results.terms_conditions = tcRows.length;
    }

    // ─── 12. Loan Settings ───
    const { data: srcLoan } = await admin
      .from("loan_settings")
      .select("*")
      .eq("tenant_id", SOURCE_TENANT_ID)
      .maybeSingle();

    if (srcLoan) {
      const { error } = await admin.from("loan_settings").insert({
        id: uuid(),
        tenant_id: tenant_id,
        interest_rate_low: srcLoan.interest_rate_low,
        interest_rate_medium: srcLoan.interest_rate_medium,
        interest_rate_high: srcLoan.interest_rate_high,
        interest_type: srcLoan.interest_type,
        loan_fee_low: srcLoan.loan_fee_low,
        loan_fee_medium: srcLoan.loan_fee_medium,
        loan_fee_high: srcLoan.loan_fee_high,
        max_term_months: srcLoan.max_term_months,
        pool_value_multiple: srcLoan.pool_value_multiple,
        is_active: srcLoan.is_active,
      });
      if (error) console.error("Loan settings error:", error);
      results.loan_settings = 1;
    }

    // ─── 13. Permissions ───
    const { data: srcPerms } = await admin
      .from("permissions")
      .select("*")
      .eq("tenant_id", SOURCE_TENANT_ID);

    if (srcPerms && srcPerms.length > 0) {
      const permRows = srcPerms.map((p: any) => ({
        id: uuid(),
        tenant_id: tenant_id,
        role: p.role,
        resource: p.resource,
        action: p.action,
        is_allowed: p.is_allowed,
      }));
      const { error } = await admin.from("permissions").insert(permRows);
      if (error) console.error("Permissions error:", error);
      results.permissions = permRows.length;
    }

    // ─── 14. Tenant Configuration ───
    const { data: srcConfig } = await admin
      .from("tenant_configuration")
      .select("*")
      .eq("tenant_id", SOURCE_TENANT_ID)
      .maybeSingle();

    if (srcConfig) {
      const { error } = await admin.from("tenant_configuration").insert({
        tenant_id: tenant_id,
        currency_code: srcConfig.currency_code,
        currency_symbol: srcConfig.currency_symbol,
        financial_year_end_month: srcConfig.financial_year_end_month,
        is_vat_registered: srcConfig.is_vat_registered,
        default_membership_type: srcConfig.default_membership_type,
        full_membership_enabled: srcConfig.full_membership_enabled,
        full_membership_fee: srcConfig.full_membership_fee,
        full_membership_monthly_fee: srcConfig.full_membership_monthly_fee,
        full_membership_share_amount: srcConfig.full_membership_share_amount,
        associated_membership_enabled: srcConfig.associated_membership_enabled,
        associated_membership_fee: srcConfig.associated_membership_fee,
        associated_membership_monthly_fee: srcConfig.associated_membership_monthly_fee,
        associated_membership_share_amount: srcConfig.associated_membership_share_amount,
        shares_class1_enabled: srcConfig.shares_class1_enabled,
        shares_class1_price: srcConfig.shares_class1_price,
        shares_class1_max_per_member: srcConfig.shares_class1_max_per_member,
        shares_class2_enabled: srcConfig.shares_class2_enabled,
        shares_class2_price: srcConfig.shares_class2_price,
        shares_class2_max_per_member: srcConfig.shares_class2_max_per_member,
        invoice_prefix: srcConfig.invoice_prefix,
        po_prefix: srcConfig.po_prefix,
        quote_prefix: srcConfig.quote_prefix,
        supplier_invoice_prefix: srcConfig.supplier_invoice_prefix,
        require_bank_details_for_registration: srcConfig.require_bank_details_for_registration,
        use_default_security: srcConfig.use_default_security,
        enable_lockout: srcConfig.enable_lockout,
        max_failed_attempts: srcConfig.max_failed_attempts,
        lockout_duration_seconds: srcConfig.lockout_duration_seconds,
        required_length: srcConfig.required_length,
        require_digit: srcConfig.require_digit,
        require_lowercase: srcConfig.require_lowercase,
        require_uppercase: srcConfig.require_uppercase,
        require_non_alphanumeric: srcConfig.require_non_alphanumeric,
        bank_gl_account_id: mapId(srcConfig.bank_gl_account_id),
        vat_gl_account_id: mapId(srcConfig.vat_gl_account_id),
        membership_fee_gl_account_id: mapId(srcConfig.membership_fee_gl_account_id),
        pool_allocation_gl_account_id: mapId(srcConfig.pool_allocation_gl_account_id),
        share_gl_account_id: mapId(srcConfig.share_gl_account_id),
        stock_control_gl_account_id: mapId(srcConfig.stock_control_gl_account_id),
        commission_income_gl_account_id: mapId(srcConfig.commission_income_gl_account_id),
        commission_paid_gl_account_id: mapId(srcConfig.commission_paid_gl_account_id),
        legal_entity_id: null,
        administrator_entity_id: null,
        logo_url: null, // will be updated below after server-side upload
        directors: null,
        email_signature_en: null,
        email_signature_af: null,
        smtp_host: null,
        smtp_port: null,
        smtp_username: null,
        smtp_password: null,
        smtp_from_email: null,
        smtp_from_name: null,
        smtp_enable_ssl: srcConfig.smtp_enable_ssl,
        vat_number: null,
        registration_date: null,
      });
      if (error) console.error("Tenant configuration error:", error);
      results.tenant_configuration = 1;
    }

    // ─── Upload logo server-side (service role has full storage access) ───
    if (logo_data && logo_file_name) {
      try {
        const ext = logo_file_name.split(".").pop() || "png";
        const path = `${tenant_id}/logo.${ext}`;
        const binaryStr = atob(logo_data);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
        
        const { error: uploadErr } = await admin.storage
          .from("tenant-logos")
          .upload(path, bytes, { upsert: true, contentType: logo_mime_type || `image/${ext}` });
        
        if (!uploadErr) {
          const { data: urlData } = admin.storage.from("tenant-logos").getPublicUrl(path);
          const finalLogoUrl = urlData.publicUrl;
          await admin.from("tenant_configuration")
            .update({ logo_url: finalLogoUrl })
            .eq("tenant_id", tenant_id);
          console.log("[provision-tenant] Logo uploaded:", finalLogoUrl);
        } else {
          console.error("[provision-tenant] Logo upload error:", uploadErr);
        }
      } catch (logoErr: any) {
        console.error("[provision-tenant] Logo processing error:", logoErr.message);
      }
    } else if (logo_url) {
      // Fallback: if logo_url was passed directly (legacy support)
      await admin.from("tenant_configuration")
        .update({ logo_url })
        .eq("tenant_id", tenant_id);
    }

    const { data: srcIei } = await admin
      .from("income_expense_items")
      .select("*")
      .eq("tenant_id", SOURCE_TENANT_ID);

    if (srcIei && srcIei.length > 0) {
      const ieiRows = srcIei.map((ie: any) => ({
        id: uuid(),
        tenant_id: tenant_id,
        item_code: ie.item_code,
        description: ie.description,
        recurrence_type: ie.recurrence_type,
        amount: ie.amount,
        percentage: ie.percentage,
        bankflow: ie.bankflow,
        vat: ie.vat,
        extra1: ie.extra1,
        tax_type_id: mapId(ie.tax_type_id),
        credit_control_account_id: mapId(ie.credit_control_account_id),
        debit_control_account_id: mapId(ie.debit_control_account_id),
        is_active: ie.is_active,
      }));
      const { error } = await admin.from("income_expense_items").insert(ieiRows);
      if (error) console.error("Income/expense items error:", error);
      results.income_expense_items = ieiRows.length;
    }

    // ─── 16. Transaction Fee Types ───
    const { data: srcFeeTypes } = await admin
      .from("transaction_fee_types")
      .select("*")
      .eq("tenant_id", SOURCE_TENANT_ID);

    if (srcFeeTypes && srcFeeTypes.length > 0) {
      const ftRows = srcFeeTypes.map((ft: any) => {
        const newId = uuid();
        idMap.set(ft.id, newId);
        return {
          id: newId,
          tenant_id: tenant_id,
          name: ft.name,
          code: ft.code,
          description: ft.description,
          is_active: ft.is_active,
          gl_account_id: mapId(ft.gl_account_id),
          cash_control_account_id: mapId(ft.cash_control_account_id),
          credit_control_account_id: mapId(ft.credit_control_account_id),
          based_on: ft.based_on,
          payment_method: ft.payment_method,
        };
      });
      const { error } = await admin.from("transaction_fee_types").insert(ftRows);
      if (error) console.error("Transaction fee types error:", error);
      results.transaction_fee_types = ftRows.length;
    }

    // ─── Resolve SLA plan admin percentages ───
    // Build a map of source transaction_type_id → admin % from SLA plan
    let slaDepositAdminPct: number | null = null;
    let slaOtherAdminPct: number | null = null;

    if (sla_fee_plan_id) {
      const { data: slaPlan } = await admin
        .from("sla_fee_plans")
        .select("deposit_fee_pct, switch_transfer_withdrawal_fee_pct")
        .eq("id", sla_fee_plan_id)
        .single();
      if (slaPlan) {
        slaDepositAdminPct = slaPlan.deposit_fee_pct;
        slaOtherAdminPct = slaPlan.switch_transfer_withdrawal_fee_pct;
      }
    }

    // Fetch source transaction types to map IDs → codes for admin % assignment
    const { data: srcTxnTypes } = await admin
      .from("transaction_types")
      .select("id, code")
      .eq("tenant_id", SOURCE_TENANT_ID);
    const srcTxnCodeMap = new Map<string, string>();
    (srcTxnTypes ?? []).forEach((t: any) => srcTxnCodeMap.set(t.id, (t.code || "").toUpperCase()));

    const DEPOSIT_CODES_SET = new Set(["DEPOSIT_FUNDS", "DEPOSIT_STOCK"]);

    function resolveAdminPct(srcTxnTypeId: string, originalPct: number): number {
      if (slaDepositAdminPct === null) return originalPct; // no SLA plan selected
      const code = srcTxnCodeMap.get(srcTxnTypeId) || "";
      if (DEPOSIT_CODES_SET.has(code)) return slaDepositAdminPct!;
      // Switch, Transfer, Withdrawal, Withdraw Stock
      if (["SWITCH", "TRANSFER", "WITHDRAW_FUNDS", "WITHDRAW_STOCK"].includes(code)) return slaOtherAdminPct!;
      return originalPct; // keep original for other types
    }

    // ─── 17. Transaction Fee Rules ───
    const { data: srcFeeRules } = await admin
      .from("transaction_fee_rules")
      .select("*")
      .eq("tenant_id", SOURCE_TENANT_ID);

    // We need to track which fee rule maps to which transaction type for tier admin %
    const feeRuleTxnTypeMap = new Map<string, string>(); // source fee_rule_id → source transaction_type_id

    if (srcFeeRules && srcFeeRules.length > 0) {
      const frRows = srcFeeRules.map((fr: any) => {
        const newId = uuid();
        idMap.set(fr.id, newId);
        feeRuleTxnTypeMap.set(fr.id, fr.transaction_type_id);
        return {
          id: newId,
          tenant_id: tenant_id,
          fee_type_id: mapId(fr.fee_type_id) || fr.fee_type_id,
          transaction_type_id: mapId(fr.transaction_type_id) || fr.transaction_type_id,
          calculation_method: fr.calculation_method,
          fixed_amount: fr.fixed_amount,
          percentage: fr.percentage,
          is_active: fr.is_active,
          admin_share_percentage: resolveAdminPct(fr.transaction_type_id, fr.admin_share_percentage),
        };
      });
      const { error } = await admin.from("transaction_fee_rules").insert(frRows);
      if (error) console.error("Transaction fee rules error:", error);
      results.transaction_fee_rules = frRows.length;
    }

    // ─── 18. Transaction Fee Tiers ───
    const { data: srcFeeTiers } = await admin
      .from("transaction_fee_tiers")
      .select("*")
      .eq("tenant_id", SOURCE_TENANT_ID);

    if (srcFeeTiers && srcFeeTiers.length > 0) {
      const tierRows = srcFeeTiers.map((tier: any) => {
        // Look up the source transaction_type_id via the fee rule
        const srcTxnTypeId = feeRuleTxnTypeMap.get(tier.fee_rule_id) || "";
        return {
          id: uuid(),
          tenant_id: tenant_id,
          fee_rule_id: mapId(tier.fee_rule_id) || tier.fee_rule_id,
          min_amount: tier.min_amount,
          max_amount: tier.max_amount,
          percentage: tier.percentage,
          admin_percentage: resolveAdminPct(srcTxnTypeId, tier.admin_percentage),
        };
      });
      const { error } = await admin.from("transaction_fee_tiers").insert(tierRows);
      if (error) console.error("Transaction fee tiers error:", error);
      results.transaction_fee_tiers = tierRows.length;
    }

    // ─── 19. Pool Fee Configurations ───
    const { data: srcPoolFees } = await admin
      .from("pool_fee_configurations")
      .select("*")
      .eq("tenant_id", SOURCE_TENANT_ID);

    if (srcPoolFees && srcPoolFees.length > 0) {
      const pfRows = srcPoolFees
        .filter((pf: any) => mapId(pf.pool_id))
        .map((pf: any) => ({
          id: uuid(),
          tenant_id: tenant_id,
          fee_type_id: mapId(pf.fee_type_id) || pf.fee_type_id,
          pool_id: mapId(pf.pool_id)!,
          frequency: pf.frequency,
          percentage: pf.percentage,
          fixed_amount: pf.fixed_amount,
          is_active: pf.is_active,
          admin_share_percentage: pf.admin_share_percentage,
          invoice_by_administrator: pf.invoice_by_administrator,
        }));
      if (pfRows.length > 0) {
        const { error } = await admin.from("pool_fee_configurations").insert(pfRows);
        if (error) console.error("Pool fee configurations error:", error);
        results.pool_fee_configurations = pfRows.length;
      }
    }

    // ─── Create custom pools ───
    if (custom_pools && Array.isArray(custom_pools) && custom_pools.length > 0) {
      let customCount = 0;
      for (const poolName of custom_pools) {
        const trimmed = (poolName as string).trim();
        if (!trimmed) continue;
        const newPoolId = uuid();
        const { error } = await admin.from("pools").insert({
          id: newPoolId,
          tenant_id: tenant_id,
          name: trimmed,
          description: trimmed,
          is_active: true,
        });
        if (error) {
          console.error(`Custom pool ${trimmed} error:`, error);
        } else {
          customCount++;
        }
      }
      if (customCount > 0) {
        results.custom_pools = customCount;
      }
    }

    // ─── 20. Create admin user entity, address, bank details ───
    if (admin_details && admin_details.user_id) {
      try {
        // Find "Myself" relationship type for natural person
        const { data: relTypes } = await admin
          .from("relationship_types")
          .select("id, name, entity_category_id, entity_categories!inner(entity_type, id)")
          .eq("name", "Myself");
        const myselfRel = relTypes?.find((r: any) => r.entity_categories?.entity_type === "natural_person");
        const naturalPersonCategoryId = (myselfRel as any)?.entity_categories?.id;

        // Create entity
        const entityId = uuid();
        const { error: entityErr } = await admin.from("entities").insert({
          id: entityId,
          tenant_id: tenant_id,
          name: admin_details.first_name,
          last_name: admin_details.last_name,
          initials: admin_details.initials || null,
          known_as: admin_details.known_as || null,
          identity_number: admin_details.id_type === "rsa_id" ? admin_details.id_number : null,
          passport_number: admin_details.id_type === "passport" ? admin_details.id_number : null,
          gender: admin_details.gender || null,
          date_of_birth: admin_details.date_of_birth || null,
          contact_number: admin_details.contact_number || null,
          additional_contact_number: admin_details.alt_contact_number || null,
          email_address: admin_details.email || null,
          additional_email_address: admin_details.cc_email || null,
          title_id: admin_details.title_id || null,
          language_code: admin_details.language_code || "en",
          entity_category_id: naturalPersonCategoryId || null,
          creator_user_id: admin_details.user_id,
          is_registration_complete: true,
        });
        if (entityErr) console.error("Admin entity error:", entityErr);

        // NOTE: Do NOT create a membership entity account here.
        // The admin must apply for membership separately and pay
        // their membership fee like any other member.

        // Link user to entity
        if (myselfRel) {
          const { error: linkErr } = await admin.from("user_entity_relationships").insert({
            tenant_id: tenant_id,
            user_id: admin_details.user_id,
            entity_id: entityId,
            relationship_type_id: myselfRel.id,
            is_primary: true,
          });
          if (linkErr) console.error("User-entity link error:", linkErr);
        }

        // Create address
        if (admin_details.street_address && admin_details.city) {
          const { error: addrErr } = await admin.from("addresses").insert({
            entity_id: entityId,
            tenant_id: tenant_id,
            street_address: admin_details.street_address,
            suburb: admin_details.suburb || null,
            city: admin_details.city,
            province: admin_details.province || null,
            postal_code: admin_details.postal_code || null,
            country: admin_details.country || "South Africa",
            is_primary: true,
            address_type: "residential",
          });
          if (addrErr) console.error("Admin address error:", addrErr);
        }

        // Create bank details
        if (!admin_details.skip_bank && admin_details.bank_id && admin_details.account_number) {
          const { error: bankErr } = await admin.from("entity_bank_details").insert({
            entity_id: entityId,
            tenant_id: tenant_id,
            bank_id: admin_details.bank_id,
            bank_account_type_id: admin_details.bank_account_type_id,
            account_holder: admin_details.account_name || `${admin_details.first_name} ${admin_details.last_name}`,
            account_number: admin_details.account_number,
            creator_user_id: admin_details.user_id,
            is_active: true,
          });
          if (bankErr) console.error("Admin bank details error:", bankErr);
        }

        // Save T&C acceptances (map source term IDs to new tenant term IDs)
        if (admin_details.accepted_term_ids && Array.isArray(admin_details.accepted_term_ids)) {
          for (const sourceTermId of admin_details.accepted_term_ids) {
            const newTermId = mapId(sourceTermId);
            if (newTermId) {
              await admin.from("tc_acceptances").insert({
                user_id: admin_details.user_id,
                tenant_id: tenant_id,
                terms_condition_id: newTermId,
              });
            }
          }
        }

        // Upload documents
        if (admin_documents && Array.isArray(admin_documents)) {
          for (const doc of admin_documents) {
            if (!doc.file_data || !doc.file_name) continue;
            // Decode base64
            const binaryStr = atob(doc.file_data);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) {
              bytes[i] = binaryStr.charCodeAt(i);
            }
            const filePath = `${admin_details.user_id}/${entityId}/${doc.doc_type_id}/${Date.now()}_${doc.file_name}`;
            const { error: uploadErr } = await admin.storage
              .from("member-documents")
              .upload(filePath, bytes, { contentType: doc.mime_type || "application/octet-stream" });
            if (uploadErr) {
              console.error("Doc upload error:", uploadErr);
              continue;
            }
            // Map the source document_type_id to the new tenant's document_type_id
            const newDocTypeId = mapId(doc.doc_type_id);
            await admin.from("entity_documents").insert({
              entity_id: entityId,
              tenant_id: tenant_id,
              document_type_id: newDocTypeId || doc.doc_type_id,
              file_name: doc.file_name,
              file_path: filePath,
              file_size: doc.file_size || bytes.length,
              mime_type: doc.mime_type || null,
              creator_user_id: admin_details.user_id,
            });
          }
        }

        // Profile already upserted after user creation — no need to update again

        // Set administrator_entity_id in tenant_configuration
        await admin.from("tenant_configuration")
          .update({ administrator_entity_id: entityId })
          .eq("tenant_id", tenant_id);

        results.admin_entity = 1;
      } catch (adminErr: any) {
        console.error("Admin entity creation error:", adminErr);
        // Don't fail the whole provisioning for this
      }
    }

    // ─── 21. Create Legal Entity for the co-operative ───
    try {
      // Find the Legal Entity account type (account_type = 6)
      const { data: legalEntityType } = await admin
        .from("entity_account_types")
        .select("id, prefix, number_count")
        .eq("tenant_id", tenant_id)
        .eq("account_type", 6)
        .maybeSingle();

      // Find legal_entity category
      const { data: legalEntityCategory } = await admin
        .from("entity_categories")
        .select("id")
        .eq("entity_type", "legal_entity")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      // Use the tenant name passed from the wizard, or look it up
      let finalCoopName = body.name || "";
      if (!finalCoopName) {
        const { data: tenantRec } = await admin
          .from("tenants")
          .select("name")
          .eq("id", tenant_id)
          .single();
        finalCoopName = tenantRec?.name || "Co-operative";
      }

      const legalEntityId = uuid();
      const { error: leError } = await admin.from("entities").insert({
        id: legalEntityId,
        tenant_id,
        name: finalCoopName.trim(),
        registration_number: registration_number?.trim() || null,
        entity_category_id: legalEntityCategory?.id || null,
        is_active: true,
        is_registration_complete: true,
        is_vat_registered: coop_details?.is_vat_registered || false,
        vat_number: coop_details?.is_vat_registered ? coop_details?.vat_number || null : null,
        creator_user_id: createdUserId || null,
        email_address: coop_details?.email_address || admin_details?.email || null,
        contact_number: coop_details?.contact_number || admin_details?.contact_number || null,
        website: coop_details?.website || null,
      });

      if (leError) {
        console.error("[provision-tenant] Legal entity creation error:", leError);
      } else {
        // Create entity account for legal entity
        if (legalEntityType) {
          const prefix = legalEntityType.prefix || "LE";
          const numCount = legalEntityType.number_count || 5;
          const accountNum = `${prefix}${"1".padStart(numCount, "0")}`;
          const { error: leAccErr } = await admin.from("entity_accounts").insert({
            tenant_id,
            entity_id: legalEntityId,
            entity_account_type_id: legalEntityType.id,
            account_number: accountNum,
            is_active: true,
            is_approved: true,
            status: "active",
          });
          if (leAccErr) console.warn("[provision-tenant] Legal entity account error:", leAccErr.message);
        }

        // Link admin user to legal entity if user was created
        if (createdUserId) {
          const relTypeNames = ["Director of Co-operative", "Authorised Representative", "Director of Company"];
          let relType: any = null;
          for (const rtName of relTypeNames) {
            const { data: rt } = await admin
              .from("relationship_types")
              .select("id")
              .eq("name", rtName)
              .eq("is_active", true)
              .maybeSingle();
            if (rt) { relType = rt; break; }
          }
          if (relType) {
            const { error: relErr } = await admin.from("user_entity_relationships").insert({
              tenant_id,
              user_id: createdUserId,
              entity_id: legalEntityId,
              relationship_type_id: relType.id,
              is_active: true,
            });
            if (relErr) console.warn("[provision-tenant] Legal entity user link error:", relErr.message);
          }
        }

        // Update tenant_configuration with legal_entity_id
        await admin.from("tenant_configuration")
          .update({
            legal_entity_id: legalEntityId,
            vat_number: null,
            directors: null,
          })
          .eq("tenant_id", tenant_id);

        results.legal_entity = 1;
        console.log("[provision-tenant] Legal entity created:", legalEntityId);
      }
    } catch (leErr: any) {
      console.error("[provision-tenant] Legal entity error:", leErr.message);
    }

    // ─── Send branded registration email via SMTP (not Supabase default) ───
    if (createdUserId && admin_details?.email) {
      try {
        const fnUrl = `${supabaseUrl}/functions/v1/send-registration-email`;
        const emailRes = await fetch(fnUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceRoleKey}`,
            "apikey": serviceRoleKey,
          },
          body: JSON.stringify({
            tenant_id,
            user_id: createdUserId,
          }),
        });
        const emailResult = await emailRes.json();
        console.log("[provision-tenant] Registration email result:", emailResult);
      } catch (emailErr: any) {
        console.error("[provision-tenant] Failed to send registration email:", emailErr.message);
      }
    }

    // ─── Save SLA agreement if a plan was selected ───
    if (sla_fee_plan_id) {
      try {
        const gracePeriodEnd = new Date();
        gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 7);
        await admin.from("tenant_sla").upsert({
          tenant_id,
          sla_fee_plan_id,
          registration_number: registration_number || null,
          signed_by_name: admin_details ? `${admin_details.first_name} ${admin_details.last_name}` : null,
          signature_data: sla_signature || null,
          signed_at: new Date().toISOString(),
          grace_period_ends_at: gracePeriodEnd.toISOString(),
          status: "pending",
        }, { onConflict: "tenant_id" });
        console.log("[provision-tenant] SLA agreement saved for plan:", sla_fee_plan_id);
      } catch (slaErr: any) {
        console.error("[provision-tenant] Failed to save SLA:", slaErr.message);
      }
    }

    return new Response(
      JSON.stringify({ success: true, results, user_id: createdUserId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Provision tenant error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
