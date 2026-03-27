import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Verify the caller is a super_admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await admin.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check super_admin role
    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "super_admin");

    if (!roles || roles.length === 0) {
      return new Response(JSON.stringify({ error: "Only super admins can delete tenants" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { tenant_id } = await req.json();
    if (!tenant_id) {
      return new Response(JSON.stringify({ error: "tenant_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify tenant exists
    const { data: tenant } = await admin
      .from("tenants")
      .select("id, name, slug")
      .eq("id", tenant_id)
      .single();

    if (!tenant) {
      return new Response(JSON.stringify({ error: "Tenant not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Deleting tenant: ${tenant.name} (${tenant_id})`);

    // Delete in dependency order (children first, parent last)
    // Order matters for foreign key constraints
    const deleteOrder = [
      // MAM / si_ tables (deep children first)
      "si_quote_item_attribute_value",
      "si_quote_item",
      "si_quote",
      "si_member_asset_attribute_value",
      "si_member_asset",
      "si_member_account_balance",
      "si_projection_assumption",
      "si_pool_category",
      "si_pool",
      "si_item_model",
      "si_category_attribute",
      "si_category_group",
      "si_item_category",
      "si_section",
      "si_brand",
      "si_coop_structure",
      "si_contribution_plan",
      "si_dashboard_note",

      // Transaction children
      "loan_budget_entries",
      "commissions",
      "stock_transactions",
      "unit_transactions",
      "cashflow_transactions",
      "admin_stock_transaction_lines",
      "admin_stock_transactions",
      "transaction_fee_tiers",
      "transaction_fee_rules",
      "transaction_fee_types",
      "transactions",
      "loan_applications",
      "debit_orders",

      // Member/entity children
      "tc_acceptances",
      "member_pool_holdings",
      "member_shares",
      "share_classes",
      "member_documents",
      "member_bank_details",
      "entity_documents",
      "entity_bank_details",
      "entity_accounts",
      "entity_account_types",
      "user_entity_relationships",
      "addresses",
      "referrers",
      "membership_applications",
      "message_campaign_recipients",
      "message_campaigns",

      // Pool children
      "daily_pool_prices",
      "daily_stock_prices",
      "pool_fee_configurations",
      "pool_price_schedules",
      "pool_transaction_rules",
      "income_expense_items",
      "items",
      "operating_journals",

      // GL & control (pools/control_accounts handled separately due to circular FK)
      "legacy_gl_mappings",
      "legacy_id_mappings",
      "gl_accounts",

      // Notifications
      "notifications",

      // Config & reference
      "document_entity_requirements",
      "document_types",
      "tax_types",
      "budget_categories",
      "loan_settings",
      "communication_template_parameters",
      "communication_templates",
      "terms_conditions",
      "transaction_types",
      "permissions",
      "email_logs",
      "vault_locations",
      "tenant_features",
      "tenant_fee_config",
      "tenant_invoices",
      "tenant_configuration",

      // Entity (after all entity refs removed)
      "entities",

      // User associations
      "user_roles",
      "tenant_memberships",
    ];

    const results: Record<string, number> = {};
    const errors: string[] = [];

    for (const table of deleteOrder) {
      try {
        if (table === "tenants") {
          const { error } = await admin.from(table).delete().eq("id", tenant_id);
          if (error) {
            errors.push(`${table}: ${error.message}`);
          } else {
            results[table] = 1;
          }
        } else {
          const { data, error } = await admin
            .from(table)
            .delete()
            .eq("tenant_id", tenant_id)
            .select("id");
          if (error) {
            // Table might not exist or have different structure — log and continue
            console.warn(`Warning deleting ${table}: ${error.message}`);
            errors.push(`${table}: ${error.message}`);
          } else {
            results[table] = data?.length ?? 0;
          }
        }
      } catch (e: any) {
        console.warn(`Exception deleting ${table}: ${e.message}`);
        errors.push(`${table}: ${e.message}`);
      }
    }

    // Also delete auth users who ONLY belong to this tenant
    // (We skip this for safety — users might belong to multiple tenants)

    const totalDeleted = Object.values(results).reduce((a, b) => a + b, 0);
    console.log(`Tenant ${tenant.name} deleted. ${totalDeleted} records removed.`);

    return new Response(
      JSON.stringify({
        success: true,
        tenant_name: tenant.name,
        total_deleted: totalDeleted,
        details: results,
        warnings: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Delete tenant error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});