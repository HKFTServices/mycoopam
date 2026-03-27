import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Scheduled Price Update
 * Called every 5 minutes by pg_cron. Checks pool_price_schedules for active
 * schedules whose update_time falls within the current 5-minute window.
 * If a match is found, fetches stock prices from API providers,
 * saves daily_stock_prices, then recalculates and saves daily_pool_prices.
 */

interface ApiProvider {
  id: string;
  name: string;
  base_url: string;
  auth_method: string;
  auth_param_name: string;
  secret_name: string;
  base_currency: string;
  response_path: string;
}

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
    if (tokens[pos] === "(") { pos++; const r = parseExpr(); pos++; return r; }
    if (tokens[pos] === "-") { pos++; return -parseFactor(); }
    return parseFloat(tokens[pos++]);
  }
  return parseExpr();
}

function evalFormula(formula: string, apiPrices: Record<string, number>): number | null {
  let expr = formula;
  for (const [code, price] of Object.entries(apiPrices)) {
    expr = expr.replace(new RegExp(`\\b${code}\\b`, "g"), price.toString());
  }
  if (/[a-zA-Z]/.test(expr)) return null;
  try { return evaluateExpression(expr); } catch { return null; }
}

async function fetchProviderPrices(provider: ApiProvider, symbols: string[]): Promise<Record<string, number>> {
  if (symbols.length === 0) return {};
  const apiKey = Deno.env.get(provider.secret_name);
  if (!apiKey) { console.error(`Secret ${provider.secret_name} not set`); return {}; }

  let url = `${provider.base_url}/latest`;
  if (provider.auth_method === "query_param") {
    url += `?${provider.auth_param_name}=${apiKey}&base=${provider.base_currency}&symbols=${symbols.join(",")}`;
  }

  console.log(`Fetching ${provider.name} prices for: ${symbols.join(", ")}`);
  const res = await fetch(url);
  if (!res.ok) { console.error(`${provider.name} HTTP ${res.status}`); return {}; }
  const data = await res.json();
  if (!data.success) { console.error(`${provider.name} error:`, data.error); return {}; }

  const rates = provider.response_path.split(".").reduce((obj: any, key: string) => obj?.[key], data);
  if (!rates || typeof rates !== "object") return {};

  const prices: Record<string, number> = {};
  for (const [symbol, rate] of Object.entries(rates as Record<string, number>)) {
    if (rate && rate !== 0) prices[symbol] = rate;
  }
  return prices;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const today = new Date().toISOString().slice(0, 10);

    // Get current time in SAST (UTC+2)
    const nowUtc = new Date();
    const sastOffset = 2 * 60 * 60 * 1000;
    const nowSast = new Date(nowUtc.getTime() + sastOffset);
    const currentHour = nowSast.getHours();
    const currentMinute = nowSast.getMinutes();

    console.log(`Scheduled price update check at SAST ${currentHour}:${String(currentMinute).padStart(2, "0")}`);

    // Find active schedules where update_time falls within the current 5-minute window
    const { data: schedules, error: schedErr } = await supabase
      .from("pool_price_schedules")
      .select("id, tenant_id, update_time, is_active")
      .eq("is_active", true);

    if (schedErr) throw schedErr;
    if (!schedules || schedules.length === 0) {
      return new Response(JSON.stringify({ message: "No active schedules" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Filter schedules that match the current 5-minute window
    const matchingSchedules = schedules.filter((s: any) => {
      const [h, m] = s.update_time.split(":").map(Number);
      // Match if the schedule time is within [currentMinute - 4, currentMinute]
      return h === currentHour && m >= (currentMinute - 4) && m <= currentMinute;
    });

    if (matchingSchedules.length === 0) {
      return new Response(JSON.stringify({ message: "No schedules due now" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get unique tenant IDs from matching schedules
    const tenantIds = [...new Set(matchingSchedules.map((s: any) => s.tenant_id))];
    const results: Record<string, any> = {};

    for (const tenantId of tenantIds) {
      console.log(`Processing tenant ${tenantId}`);

      // ── 1) Fetch stock items ──
      const { data: items } = await supabase
        .from("items")
        .select("id, item_code, api_code, api_provider_id, use_fixed_price, calculate_price_with_item_id, calculate_price_with_factor, calculation_type, margin_percentage, sell_margin_percentage, tax_type_id, price_formula, pool_id")
        .eq("tenant_id", tenantId)
        .eq("is_deleted", false)
        .eq("is_active", true)
        .eq("is_stock_item", true);

      if (!items || items.length === 0) {
        results[tenantId] = { message: "No stock items" };
        continue;
      }

      // Tax types
      const { data: taxTypes } = await supabase.from("tax_types").select("id, percentage").eq("is_active", true);
      const taxMap: Record<string, number> = {};
      (taxTypes || []).forEach((t: any) => { taxMap[t.id] = Number(t.percentage) / 100; });

      // API providers
      const { data: providers } = await supabase.from("api_providers").select("*").eq("is_active", true);
      const providerMap: Record<string, ApiProvider> = {};
      (providers || []).forEach((p: any) => { providerMap[p.id] = p; });

      // Group symbols by provider
      const symbolsByProvider: Record<string, Set<string>> = {};
      for (const item of items) {
        if (!item.api_provider_id || !item.api_code) continue;
        if (!symbolsByProvider[item.api_provider_id]) symbolsByProvider[item.api_provider_id] = new Set();
        symbolsByProvider[item.api_provider_id].add(item.api_code.toUpperCase());
        if (item.price_formula) {
          const matches = item.price_formula.match(/\b[A-Z]{2,10}\b/g);
          if (matches) matches.forEach((m: string) => symbolsByProvider[item.api_provider_id!].add(m));
        }
      }

      // Fetch prices from each provider
      const rawApiPrices: Record<string, number> = {};
      const allApiPrices: Record<string, Record<string, number>> = {};
      for (const [providerId, symbolSet] of Object.entries(symbolsByProvider)) {
        const provider = providerMap[providerId];
        if (!provider) continue;
        const prices = await fetchProviderPrices(provider, [...symbolSet]);
        allApiPrices[providerId] = prices;
        Object.assign(rawApiPrices, prices);
      }

      console.log(`API prices for tenant ${tenantId}:`, rawApiPrices);

      // ── 2) Calculate and save stock prices ──
      const stockRecords: any[] = [];
      for (const item of items) {
        let costExclVat = 0;
        const code = item.api_code?.toUpperCase();
        const providerPrices = item.api_provider_id ? (allApiPrices[item.api_provider_id] || {}) : {};

        if (item.price_formula && code && providerPrices[code] != null) {
          const evaluated = evalFormula(item.price_formula, rawApiPrices);
          if (evaluated != null) costExclVat = evaluated;
        } else if (code && providerPrices[code] != null) {
          const factor = item.calculate_price_with_factor ?? 1;
          costExclVat = providerPrices[code] * factor;
        } else if (item.use_fixed_price != null) {
          costExclVat = item.use_fixed_price;
        }

        if (costExclVat <= 0) continue;

        const vatRate = item.tax_type_id ? (taxMap[item.tax_type_id] ?? 0) : 0;
        const costInclVat = costExclVat * (1 + vatRate);
        const buyPriceExclVat = costExclVat * (1 + (item.margin_percentage || 0) / 100);
        const buyPriceInclVat = buyPriceExclVat * (1 + vatRate);

        stockRecords.push({
          tenant_id: tenantId,
          item_id: item.id,
          price_date: today,
          cost_excl_vat: Math.round(costExclVat * 100) / 100,
          cost_incl_vat: Math.round(costInclVat * 100) / 100,
          buy_price_excl_vat: Math.round(buyPriceExclVat * 100) / 100,
          buy_price_incl_vat: Math.round(buyPriceInclVat * 100) / 100,
        });
      }

      if (stockRecords.length > 0) {
        // Delete existing stock prices for today
        await supabase.from("daily_stock_prices").delete().eq("tenant_id", tenantId).eq("price_date", today);
        const { error: stockErr } = await supabase.from("daily_stock_prices").insert(stockRecords);
        if (stockErr) { console.error(`Stock price save error for ${tenantId}:`, stockErr); continue; }
        console.log(`Saved ${stockRecords.length} stock prices for tenant ${tenantId}`);
      }

      // ── 3) Calculate and save pool prices ──
      const { data: pools } = await supabase
        .from("pools")
        .select("id, name, fixed_unit_price, open_unit_price, cash_control_account_id, vat_control_account_id, loan_control_account_id")
        .eq("tenant_id", tenantId)
        .eq("is_deleted", false)
        .eq("is_active", true);

      if (!pools || pools.length === 0) {
        results[tenantId] = { stockPricesSaved: stockRecords.length, poolPricesSaved: 0 };
        continue;
      }

      // Get stock quantities
      const { data: stockQtyData } = await supabase.rpc("get_stock_quantities", { p_tenant_id: tenantId });
      const stockQtys: Record<string, number> = {};
      (stockQtyData || []).forEach((r: any) => { if (r.item_id) stockQtys[r.item_id] = Number(r.total_quantity); });

      // Get control account balances
      const { data: balanceData } = await supabase.rpc("get_cft_control_balances", { p_tenant_id: tenantId });
      const balances: Record<string, number> = {};
      (balanceData || []).forEach((r: any) => {
        if (r.control_account_id) balances[r.control_account_id] = (balances[r.control_account_id] || 0) + Number(r.balance);
      });

      // Get pool units
      const { data: unitData } = await supabase.rpc("get_pool_units", { p_tenant_id: tenantId, p_up_to_date: today });
      const unitsByPool: Record<string, number> = {};
      (unitData || []).forEach((r: any) => { if (r.pool_id) unitsByPool[r.pool_id] = Number(r.total_units); });

      // Build stock price lookup from what we just saved
      const stockPriceMap: Record<string, { cost: number; buy: number }> = {};
      stockRecords.forEach((r) => {
        stockPriceMap[r.item_id] = { cost: r.cost_excl_vat, buy: r.buy_price_excl_vat };
      });

      // Group items by pool
      const itemsByPool: Record<string, typeof items> = {};
      items.forEach((item) => {
        if (!itemsByPool[item.pool_id]) itemsByPool[item.pool_id] = [];
        itemsByPool[item.pool_id].push(item);
      });

      const poolRecords: any[] = [];
      for (const pool of pools) {
        const poolItems = itemsByPool[pool.id] || [];
        let totalStock = 0;
        let totalStockBuy = 0;
        let totalStockSell = 0;

        for (const item of poolItems) {
          const qty = stockQtys[item.id] || 0;
          const prices = stockPriceMap[item.id];
          if (!prices) continue;
          totalStock += prices.cost * qty;
          totalStockBuy += prices.buy * qty;
          const sellPrice = prices.cost * (1 - ((item as any).sell_margin_percentage || 0) / 100);
          totalStockSell += sellPrice * qty;
        }

        const cashControl = pool.cash_control_account_id ? (balances[pool.cash_control_account_id] || 0) : 0;
        const vatControl = pool.vat_control_account_id ? (balances[pool.vat_control_account_id] || 0) : 0;
        const loanControl = pool.loan_control_account_id ? (balances[pool.loan_control_account_id] || 0) : 0;
        const totalUnits = unitsByPool[pool.id] || 0;

        const memberInterestSell = totalStockSell + cashControl + vatControl + loanControl;
        const memberInterestBuy = totalStockBuy + cashControl + vatControl + loanControl;

        const isFixedPrice = pool.fixed_unit_price != null && Number(pool.fixed_unit_price) > 0;
        const openPrice = Number((pool as any).open_unit_price) || 1;
        const unitPriceSell = isFixedPrice ? Number(pool.fixed_unit_price) : (totalUnits > 0 ? memberInterestSell / totalUnits : openPrice);
        const unitPriceBuy = isFixedPrice ? Number(pool.fixed_unit_price) : (totalUnits > 0 ? memberInterestBuy / totalUnits : openPrice);

        poolRecords.push({
          tenant_id: tenantId,
          pool_id: pool.id,
          totals_date: today,
          total_stock: Math.round(totalStock * 100) / 100,
          total_units: Math.round(totalUnits * 100) / 100,
          cash_control: Math.round(cashControl * 100) / 100,
          vat_control: Math.round(vatControl * 100) / 100,
          loan_control: Math.round(loanControl * 100) / 100,
          member_interest_sell: Math.round(memberInterestSell * 100) / 100,
          member_interest_buy: Math.round(memberInterestBuy * 100) / 100,
          unit_price_sell: Math.round(unitPriceSell * 100) / 100,
          unit_price_buy: Math.round(unitPriceBuy * 100) / 100,
        });
      }

      if (poolRecords.length > 0) {
        await supabase.from("daily_pool_prices").delete().eq("tenant_id", tenantId).eq("totals_date", today);
        const { error: poolErr } = await supabase.from("daily_pool_prices").insert(poolRecords);
        if (poolErr) { console.error(`Pool price save error for ${tenantId}:`, poolErr); }
        else { console.log(`Saved ${poolRecords.length} pool prices for tenant ${tenantId}`); }
      }

      results[tenantId] = {
        stockPricesSaved: stockRecords.length,
        poolPricesSaved: poolRecords.length,
        apiPrices: rawApiPrices,
      };
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Scheduled price update error:", err);
    return new Response(JSON.stringify({ error: err.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
