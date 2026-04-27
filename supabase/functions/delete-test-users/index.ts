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

    const { pattern } = await req.json();
    if (!pattern) {
      return new Response(JSON.stringify({ error: "pattern required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // List all auth users (paginated) and match by email pattern (SQL ILIKE -> regex)
    const regex = new RegExp("^" + pattern.replace(/%/g, ".*").replace(/_/g, ".") + "$", "i");
    const matches: { id: string; email: string }[] = [];

    let page = 1;
    while (true) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      for (const u of data.users) {
        if (u.email && regex.test(u.email)) matches.push({ id: u.id, email: u.email });
      }
      if (data.users.length < 1000) break;
      page++;
    }

    const results: { email: string; deleted: boolean; error?: string }[] = [];
    for (const m of matches) {
      const { error } = await admin.auth.admin.deleteUser(m.id);
      results.push({ email: m.email, deleted: !error, error: error?.message });
    }

    return new Response(JSON.stringify({ matched: matches.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
