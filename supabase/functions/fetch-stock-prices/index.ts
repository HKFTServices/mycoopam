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
  api_key: string | null;
  api_link: string | null;
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
 * Variables must be substituted before calling this.
 */
function evaluateExpression(expr: string): number {
  // Tokenize: numbers, operators, parentheses
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
      pos++; // skip (
      const result = parseExpr();
      pos++; // skip )
      return result;
    }
    // Handle unary minus
    if (tokens[pos] === "-") {
      pos++;
      return -parseFactor();
    }
    return parseFloat(tokens[pos++]);
  }

  const result = parseExpr();
  return result;
}

/**
 * Evaluate a price formula by substituting API code variables with their prices.
 * E.g. "XAG * 1.08 + 50" with apiPrices = { XAG: 1235.80 }
 */
function evalFormula(formula: string, apiPrices: Record<string, number>): number | null {
  let expr = formula;
  // Replace all known API code variables with their values
  for (const [code, price] of Object.entries(apiPrices)) {
    expr = expr.replace(new RegExp(`\\b${code}\\b`, "g"), price.toString());
  }
  // Check if there are still unresolved variables (letters remaining)
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

async function fetchApiPrice(
  apiLink: string,
  apiCode: string,
  apiKey: string | null
): Promise<number | null> {
  let url = apiLink;
  const headers: Record<string, string> = {};

  if (url.includes("gold-api.com")) {
    url = `https://api.gold-api.com/price/${apiCode}`;
    if (apiKey) headers["x-api-key"] = apiKey;
  } else if (url.includes("goldapi.io")) {
    url = `https://www.goldapi.io/api/${apiCode}/ZAR`;
    if (apiKey) headers["x-access-token"] = apiKey;
  } else if (url.includes("coingecko")) {
    url = `https://api.coingecko.com/api/v3/simple/price?ids=${apiCode}&vs_currencies=zar`;
  } else {
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  }

  try {
    console.log(`Fetching price for ${apiCode} from ${url}`);
    const res = await fetch(url, { headers });
    if (!res.ok) {
      console.error(`API error for ${apiCode}: ${res.status}`);
      return null;
    }
    const data = await res.json();

    if (url.includes("goldapi.io")) return data.price ?? null;
    if (url.includes("gold-api.com")) return data.price ?? null;
    if (url.includes("coingecko")) return data[apiCode]?.zar ?? null;
    return data.price ?? null;
  } catch (err) {
    console.error(`Fetch error for ${apiCode}:`, err);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tenant_id } = await req.json();
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch all active stock items
    const { data: items, error: itemsError } = await supabase
      .from("items")
      .select("id, item_code, api_code, api_key, api_link, use_fixed_price, calculate_price_with_item_id, calculate_price_with_factor, calculation_type, margin_percentage, tax_type_id, price_formula")
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

    // Collect unique API codes and their configs to fetch prices
    const apiConfigs: Record<string, { apiLink: string; apiKey: string | null }> = {};
    for (const item of (items || []) as ItemRow[]) {
      if (item.api_code && item.api_link) {
        if (!apiConfigs[item.api_code]) {
          apiConfigs[item.api_code] = { apiLink: item.api_link, apiKey: item.api_key };
        }
      }
    }

    // Fetch all unique API prices in parallel
    const rawApiPrices: Record<string, number> = {};
    const fetchPromises = Object.entries(apiConfigs).map(async ([code, config]) => {
      const price = await fetchApiPrice(config.apiLink, code, config.apiKey);
      if (price != null) rawApiPrices[code] = price;
    });
    await Promise.all(fetchPromises);

    console.log("Raw API prices:", rawApiPrices);

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

      if (item.price_formula && item.api_code && rawApiPrices[item.api_code] != null) {
        // Formula-based pricing: evaluate the formula with live API prices
        apiPriceRaw = rawApiPrices[item.api_code];
        const evaluated = evalFormula(item.price_formula, rawApiPrices);
        if (evaluated != null) {
          costExclVat = evaluated;
          pricingSource = "Formula";
          formulaUsed = item.price_formula;
        }
      } else if (item.api_code && rawApiPrices[item.api_code] != null) {
        // API with factor (legacy/simple)
        apiPriceRaw = rawApiPrices[item.api_code];
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
