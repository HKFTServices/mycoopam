import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ItemRow {
  id: string;
  item_code: string;
  api_code: string | null;
  use_fixed_price: number | null;
  calculate_price_with_item_id: string | null;
  calculate_price_with_factor: number | null;
  calculation_type: string | null;
  margin_percentage: number;
  tax_type_id: string | null;
  price_formula: string | null;
}

/**
 * Safe arithmetic expression evaluator.
 * Supports: +, -, *, /, parentheses, and decimal numbers.
 */
function evaluateExpression(expr: string): number {
  const tokens: string[] = [];
  let i = 0;
  const s = expr.replace(/\s+/g, "");

  while (i < s.length) {
    if ((s[i] >= "0" && s[i] <= "9") || s[i] === ".") {
      let num = "";
      while (i < s.length && ((s[i] >= "0" && s[i] <= "9") || s[i] === ".")) {
        num += s[i++];
      }
      tokens.push(num);
    } else if ("+-*/()".includes(s[i])) {
      tokens.push(s[i++]);
    } else {
      throw new Error(`Unexpected character: ${s[i]}`);
    }
  }

  let pos = 0;

  function parseExpr(): number {
    let result = parseTerm();
    while (pos < tokens.length && (tokens[pos] === "+" || tokens[pos] === "-")) {
      const op = tokens[pos++];
      const right = parseTerm();
      result = op === "+" ? result + right : result - right;
    }
    return result;
  }

  function parseTerm(): number {
    let result = parseFactor();
    while (pos < tokens.length && (tokens[pos] === "*" || tokens[pos] === "/")) {
      const op = tokens[pos++];
      const right = parseFactor();
      result = op === "*" ? result * right : result / right;
    }
    return result;
  }

  function parseFactor(): number {
    if (tokens[pos] === "(") {
      pos++;
      const result = parseExpr();
      pos++;
      return result;
    }
    if (tokens[pos] === "-") {
      pos++;
      return -parseFactor();
    }
    return parseFloat(tokens[pos++]);
  }

  return parseExpr();
}

/**
 * Evaluate a price formula by substituting API code variables with their prices.
 * E.g. "XAG * 1.08 + 50" with apiPrices = { XAG: 1235.80 }
 */
function evalFormula(formula: string, apiPrices: Record<string, number>): number | null {
  let expr = formula;
  for (const [code, price] of Object.entries(apiPrices)) {
    expr = expr.replace(new RegExp(`\\b${code}\\b`, "g"), price.toString());
  }
  if (/[a-zA-Z]/.test(expr)) {
    console.error(`Unresolved variables in formula: ${formula} -> ${expr}`);
    return null;
  }
  try {
    return evaluateExpression(expr);
  } catch (err) {
    console.error(`Formula eval error: ${formula} -> ${expr}`, err);
    return null;
  }
}


/**
 * Fetch all prices from metals-api.com in a single call.
 * Uses /latest for today or /YYYY-MM-DD for historical dates.
 * Base=ZAR so rates are already in ZAR.
 */
async function fetchMetalsApiPrices(
  symbols: string[],
  apiKey: string,
  priceDate?: string
): Promise<Record<string, number>> {
  if (symbols.length === 0) return {};

  // Determine if we need historical or latest
  const today = new Date().toISOString().slice(0, 10);
  const isHistorical = priceDate && priceDate !== today;
  const endpoint = isHistorical ? priceDate : "latest";
  
  const url = `https://metals-api.com/api/${endpoint}?access_key=${apiKey}&base=ZAR&symbols=${symbols.join(",")}`;
  console.log(`Fetching metals-api ${isHistorical ? "historical" : "latest"} prices for: ${symbols.join(", ")}${isHistorical ? ` (date: ${priceDate})` : ""}`);

  const res = await fetch(url);
  if (!res.ok) {
    console.error(`metals-api HTTP error: ${res.status}`);
    const text = await res.text();
    console.error(`Response: ${text}`);
    return {};
  }

  const data = await res.json();
  if (!data.success) {
    console.error(`metals-api error:`, data.error);
    return {};
  }

  const prices: Record<string, number> = {};
  for (const [symbol, rate] of Object.entries(data.rates as Record<string, number>)) {
    if (rate && rate !== 0) {
      prices[symbol] = rate;
    }
  }

  return prices;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tenant_id, price_date } = await req.json();
    if (!tenant_id) {
      return new Response(JSON.stringify({ error: "tenant_id is required" }), {
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

    // Fetch all active stock items
    const { data: items, error: itemsError } = await supabase
      .from("items")
      .select("id, item_code, api_code, use_fixed_price, calculate_price_with_item_id, calculate_price_with_factor, calculation_type, margin_percentage, tax_type_id, price_formula")
      .eq("tenant_id", tenant_id)
      .eq("is_deleted", false)
      .eq("is_active", true)
      .eq("is_stock_item", true);

    if (itemsError) throw itemsError;

    // Fetch tax types
    const { data: taxTypes } = await supabase
      .from("tax_types")
      .select("id, percentage")
      .eq("is_active", true);

    const taxMap: Record<string, number> = {};
    (taxTypes || []).forEach((t: any) => {
      taxMap[t.id] = Number(t.percentage) / 100;
    });

    // Collect unique API codes to fetch
    const apiCodes = new Set<string>();
    for (const item of (items || []) as ItemRow[]) {
      if (item.api_code) {
        apiCodes.add(item.api_code.toUpperCase());
      }
      // Also extract any codes referenced in formulas
      if (item.price_formula) {
        const matches = item.price_formula.match(/\b[A-Z]{2,10}\b/g);
        if (matches) matches.forEach((m) => apiCodes.add(m));
      }
    }

    // Single API call to metals-api for all symbols
    const rawApiPrices = await fetchMetalsApiPrices([...apiCodes], metalsApiKey);
    console.log("Metals-API prices (ZAR per unit):", rawApiPrices);

    // Calculate cost prices for all items
    const results: Record<string, {
      cost_excl_vat: number;
      cost_incl_vat: number;
      buy_price_excl_vat: number;
      buy_price_incl_vat: number;
      pricing_source: string;
      api_price_raw: number | null;
      formula_used: string | null;
    }> = {};

    for (const item of (items || []) as ItemRow[]) {
      let costExclVat = 0;
      let pricingSource = "Manual";
      let apiPriceRaw: number | null = null;
      let formulaUsed: string | null = null;

      const code = item.api_code?.toUpperCase();

      if (item.price_formula && code && rawApiPrices[code] != null) {
        // Formula-based pricing
        apiPriceRaw = rawApiPrices[code];
        const evaluated = evalFormula(item.price_formula, rawApiPrices);
        if (evaluated != null) {
          costExclVat = evaluated;
          pricingSource = "Formula";
          formulaUsed = item.price_formula;
        }
      } else if (code && rawApiPrices[code] != null) {
        // Direct API price with optional factor
        apiPriceRaw = rawApiPrices[code];
        const factor = item.calculate_price_with_factor ?? 1;
        costExclVat = apiPriceRaw * factor;
        pricingSource = "API";
      } else if (item.use_fixed_price != null) {
        costExclVat = item.use_fixed_price;
        pricingSource = "Fixed";
      }

      const vatRate = item.tax_type_id ? (taxMap[item.tax_type_id] ?? 0) : 0;
      const costInclVat = costExclVat * (1 + vatRate);
      const buyPriceExclVat = costExclVat * (1 + item.margin_percentage / 100);
      const buyPriceInclVat = buyPriceExclVat * (1 + vatRate);

      results[item.id] = {
        cost_excl_vat: Math.round(costExclVat * 100) / 100,
        cost_incl_vat: Math.round(costInclVat * 100) / 100,
        buy_price_excl_vat: Math.round(buyPriceExclVat * 100) / 100,
        buy_price_incl_vat: Math.round(buyPriceInclVat * 100) / 100,
        pricing_source: pricingSource,
        api_price_raw: apiPriceRaw,
        formula_used: formulaUsed,
      };
    }

    return new Response(JSON.stringify({ prices: results, raw_api_prices: rawApiPrices }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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
