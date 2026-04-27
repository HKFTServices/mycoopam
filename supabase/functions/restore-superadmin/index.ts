import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { user_id, email, password, first_name, last_name } = await req.json();

    // 1. Create auth user with specific UUID
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      id: user_id,
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name, last_name },
    });
    if (createErr) throw new Error("createUser: " + createErr.message);

    // 2. Profile (handle_new_user trigger should create it, but ensure)
    const { error: profErr } = await admin
      .from("profiles")
      .upsert({ user_id, email, first_name, last_name }, { onConflict: "user_id" });
    if (profErr) throw new Error("profiles: " + profErr.message);

    // 3. super_admin global role
    const { error: roleErr } = await admin
      .from("user_roles")
      .insert({ user_id, role: "super_admin", tenant_id: null });
    if (roleErr && !roleErr.message.includes("duplicate")) {
      throw new Error("user_roles: " + roleErr.message);
    }

    // 4. Recreate tenant_memberships from surviving entity relationships
    const { data: rels } = await admin
      .from("user_entity_relationships")
      .select("entity_id, entities!inner(tenant_id)")
      .eq("user_id", user_id);

    const tenantIds = Array.from(new Set((rels || []).map((r: any) => r.entities.tenant_id)));
    const memberships = tenantIds.map((tenant_id) => ({ tenant_id, user_id, is_active: true }));
    let tmInserted = 0;
    if (memberships.length > 0) {
      const { data: tmData, error: tmErr } = await admin
        .from("tenant_memberships")
        .upsert(memberships, { onConflict: "tenant_id,user_id" })
        .select("id");
      if (tmErr) throw new Error("tenant_memberships: " + tmErr.message);
      tmInserted = tmData?.length ?? 0;
    }

    return new Response(
      JSON.stringify({
        success: true,
        auth_user: created.user?.id,
        profile: true,
        super_admin_role: true,
        tenants_rejoined: tmInserted,
        tenant_ids: tenantIds,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
