import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { item_id } = await req.json();
    if (!item_id) {
      return new Response(JSON.stringify({ error: "item_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const metalsApiKey = Deno.env.get("METALS_API_KEY");
    if (!metalsApiKey) {
      return new Response(JSON.stringify({ error: "METALS_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch item
    const { data: item, error: itemError } = await supabase
      .from("items")
      .select("api_code, item_code")
      .eq("id", item_id)
      .single();

    if (itemError || !item) {
      return new Response(JSON.stringify({ error: "Item not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!item.api_code) {
      return new Response(
        JSON.stringify({ error: "Item has no API code configured" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const symbol = item.api_code.toUpperCase();
    const url = `https://metals-api.com/api/latest?access_key=${metalsApiKey}&base=ZAR&symbols=${symbol}`;

    console.log(`Testing metals-api for ${symbol}`);

    const apiResponse = await fetch(url);
    const data = await apiResponse.json();

    let priceInZar: number | null = null;
    if (data.success && data.rates && data.rates[symbol]) {
      priceInZar = data.rates[symbol];
    }

    return new Response(
      JSON.stringify({
        status: apiResponse.status,
        symbol,
        api_response: data,
        price_in_zar: priceInZar,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
