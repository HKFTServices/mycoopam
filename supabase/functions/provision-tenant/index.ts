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
    const { tenant_id, selected_pool_ids } = await req.json();

    if (!tenant_id || !selected_pool_ids || !Array.isArray(selected_pool_ids)) {
      return new Response(
        JSON.stringify({ error: "tenant_id and selected_pool_ids are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

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

    // ─── 1. GL Accounts (no pool dependency, but control_account_id needs mapping later) ───
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
          // control_account_id will be updated after control accounts are created
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
          rate: t.rate,
          code: t.code,
          is_active: t.is_active,
        };
      });
      const { error } = await admin.from("tax_types").insert(taxRows);
      if (error) console.error("Tax types error:", error);
      results.tax_types = taxRows.length;
    }

    // ─── 3. Pools (only selected ones) ───
    // The create_pool_control_accounts trigger will auto-create control accounts
    const { data: srcPools } = await admin
      .from("pools")
      .select("*")
      .eq("tenant_id", SOURCE_TENANT_ID)
      .in("id", selected_pool_ids);

    if (srcPools && srcPools.length > 0) {
      for (const pool of srcPools) {
        const newPoolId = uuid();
        idMap.set(pool.id, newPoolId);

        // Insert pool — the trigger creates control accounts automatically
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

      // Fetch newly created control accounts to build the mapping
      const { data: newControlAccounts } = await admin
        .from("control_accounts")
        .select("*")
        .eq("tenant_id", tenant_id);

      const { data: srcControlAccounts } = await admin
        .from("control_accounts")
        .select("*")
        .eq("tenant_id", SOURCE_TENANT_ID);

      // Map source control accounts to new ones by matching pool + account_type
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

      // Now update GL accounts that reference control accounts
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

    // ─── 4. Items (stock items linked to selected pools) ───
    const { data: srcItems } = await admin
      .from("items")
      .select("*")
      .eq("tenant_id", SOURCE_TENANT_ID)
      .in("pool_id", selected_pool_ids);

    if (srcItems && srcItems.length > 0) {
      const itemRows = srcItems.map((item: any) => {
        const newId = uuid();
        idMap.set(item.id, newId);
        return {
          id: newId,
          tenant_id: tenant_id,
          item_code: item.item_code,
          description: item.description,
          pool_id: mapId(item.pool_id) || item.pool_id,
          is_stock_item: item.is_stock_item,
          is_active: item.is_active,
          margin_percentage: item.margin_percentage,
          sell_margin_percentage: item.sell_margin_percentage,
          show_item_price_on_statement: item.show_item_price_on_statement,
          tax_type_id: mapId(item.tax_type_id),
          api_provider_id: item.api_provider_id, // global
          api_code: item.api_code,
          api_key: item.api_key,
          api_link: item.api_link,
          calculation_type: item.calculation_type,
          price_formula: item.price_formula,
          use_fixed_price: item.use_fixed_price,
          calculate_price_with_factor: item.calculate_price_with_factor,
          // calculate_price_with_item_id will be mapped after all items created
        };
      });
      const { error } = await admin.from("items").insert(itemRows);
      if (error) console.error("Items error:", error);
      results.items = itemRows.length;

      // Fix cross-item references (calculate_price_with_item_id)
      for (const item of srcItems) {
        if (item.calculate_price_with_item_id) {
          const newItemId = idMap.get(item.id);
          const refId = mapId(item.calculate_price_with_item_id);
          if (newItemId && refId) {
            await admin.from("items").update({ calculate_price_with_item_id: refId }).eq("id", newItemId);
          }
        }
      }
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
        relationship_type_id: dr.relationship_type_id, // global table
        is_active: dr.is_active,
        is_required_for_registration: dr.is_required_for_registration,
      }));
      // Insert in batches of 50 to avoid payload limits
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
      const eatRows = srcEATypes.map((eat: any) => {
        const newId = uuid();
        idMap.set(eat.id, newId);
        return {
          id: newId,
          tenant_id: tenant_id,
          name: eat.name,
          prefix: eat.prefix,
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

    // ─── 9. Communication Templates (EN + AF pairs) ───
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

    // ─── 10. Terms & Conditions ───
    const { data: srcTerms } = await admin
      .from("terms_conditions")
      .select("*")
      .eq("tenant_id", SOURCE_TENANT_ID);

    if (srcTerms && srcTerms.length > 0) {
      const tcRows = srcTerms.map((tc: any) => ({
        id: uuid(),
        tenant_id: tenant_id,
        name: tc.name,
        condition_type: tc.condition_type,
        language_code: tc.language_code,
        content_html: tc.content_html,
        version: tc.version,
        is_active: tc.is_active,
      }));
      const { error } = await admin.from("terms_conditions").insert(tcRows);
      if (error) console.error("Terms & conditions error:", error);
      results.terms_conditions = tcRows.length;
    }

    // ─── 11. Loan Settings ───
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

    // ─── 12. Permissions ───
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

    // ─── 13. Tenant Configuration (structure only, no entity/logo) ───
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
        // Map GL account references
        bank_gl_account_id: mapId(srcConfig.bank_gl_account_id),
        vat_gl_account_id: mapId(srcConfig.vat_gl_account_id),
        membership_fee_gl_account_id: mapId(srcConfig.membership_fee_gl_account_id),
        pool_allocation_gl_account_id: mapId(srcConfig.pool_allocation_gl_account_id),
        share_gl_account_id: mapId(srcConfig.share_gl_account_id),
        stock_control_gl_account_id: mapId(srcConfig.stock_control_gl_account_id),
        commission_income_gl_account_id: mapId(srcConfig.commission_income_gl_account_id),
        commission_paid_gl_account_id: mapId(srcConfig.commission_paid_gl_account_id),
        // Leave these blank for new tenant
        legal_entity_id: null,
        administrator_entity_id: null,
        logo_url: null,
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

    // ─── 14. Income/Expense Items (if any exist) ───
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

    return new Response(
      JSON.stringify({ success: true, results }),
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
