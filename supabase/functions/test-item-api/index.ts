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

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch item
    const { data: item, error: itemError } = await supabase
      .from("items")
      .select("api_code, api_key, api_link")
      .eq("id", item_id)
      .single();

    if (itemError || !item) {
      return new Response(JSON.stringify({ error: "Item not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!item.api_link && !item.api_code) {
      return new Response(
        JSON.stringify({ error: "Item has no API link or code configured" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Build the API request URL based on the provider
    let url = item.api_link || "";
    const headers: Record<string, string> = {};

    if (url.includes("gold-api.com")) {
      // gold-api.com: https://api.gold-api.com/price/XAU (returns USD price)
      // No auth needed for free tier price endpoint
      if (item.api_code) {
        url = `https://api.gold-api.com/price/${item.api_code}`;
      }
      if (item.api_key) {
        headers["x-api-key"] = item.api_key;
      }
    } else if (url.includes("goldapi.io")) {
      // goldapi.io: https://www.goldapi.io/api/XAU/ZAR
      // Auth: x-access-token header
      if (item.api_code) {
        url = `https://www.goldapi.io/api/${item.api_code}/ZAR`;
      }
      if (item.api_key) {
        headers["x-access-token"] = item.api_key;
      }
    } else if (url.includes("coingecko")) {
      // CoinGecko: no key needed for free tier
      if (item.api_code) {
        url = `https://api.coingecko.com/api/v3/simple/price?ids=${item.api_code}&vs_currencies=zar`;
      }
    } else {
      // Generic: pass api_key as Authorization Bearer if present
      if (item.api_key) {
        headers["Authorization"] = `Bearer ${item.api_key}`;
      }
    }

    console.log(`Testing API: ${url}`);

    const apiResponse = await fetch(url, { headers });
    const responseText = await apiResponse.text();
    let result: unknown;

    try {
      result = JSON.parse(responseText);
    } catch {
      result = responseText;
    }

    return new Response(
      JSON.stringify({
        status: apiResponse.status,
        url,
        result,
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
