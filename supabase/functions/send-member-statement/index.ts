import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.10";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function formatCurrency(value: number, symbol = "R", decimals = 2): string {
  const isNegative = value < 0;
  const abs = Math.abs(value);
  const fixed = abs.toFixed(decimals);
  const [intPart, decPart] = fixed.split(".");
  const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${isNegative ? "-" : ""}${symbol} ${formatted}.${decPart}`;
}

function fmtDate(d: string): string {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
}

function generateStatementHtml(data: {
  fromDate: string;
  toDate: string;
  currencySymbol: string;
  entity: any;
  entityAccounts: any[];
  memberAddress: any;
  tenantConfig: any;
  legalEntity: any;
  legalAddress: any;
  unitTransactions: any[];
  cashflowTransactions: any[];
  stockTransactions: any[];
  loanOutstanding: number;
  loanPayout: number;
  loanRepaid: number;
  openingUnits: any[];
  closingUnits: any[];
  poolPricesStart: Record<string, any>;
  poolPricesEnd: Record<string, any>;
}): string {
  const sym = data.currencySymbol;
  const entity = data.entity;
  const memberName = [entity?.name, entity?.last_name].filter(Boolean).join(" ");
  const memberId = entity?.identity_number || entity?.registration_number || "";
  const category = entity?.entity_categories?.name || "";
  const memberAcct = data.entityAccounts.find((a: any) => a.entity_account_types?.account_type === 1);
  const accountNumber = memberAcct?.account_number || "N/A";
  const memberAddr = data.memberAddress
    ? [data.memberAddress.street_address, data.memberAddress.suburb, data.memberAddress.city, data.memberAddress.province, data.memberAddress.postal_code].filter(Boolean).join(", ")
    : "";

  const tc = data.tenantConfig;
  const le = data.legalEntity;
  const coopName = le?.name || "";
  const coopRegNo = le?.registration_number || "";
  const coopPhone = le?.contact_number || "";
  const coopEmail = le?.email_address || "";
  const logoUrl = tc?.logo_url || "";
  const directors = tc?.directors || "";
  const vatNumber = tc?.vat_number || "";
  const coopAddr = data.legalAddress
    ? [data.legalAddress.street_address, data.legalAddress.suburb, data.legalAddress.city, data.legalAddress.province, data.legalAddress.postal_code].filter(Boolean).join(", ")
    : "";

  const poolSummary: Record<string, { name: string; openUnits: number; closeUnits: number; openPrice: number; closePrice: number }> = {};

  for (const row of data.openingUnits) {
    const poolId = row.pool_id;
    const priceInfo = data.poolPricesStart[poolId];
    if (!poolSummary[poolId]) {
      poolSummary[poolId] = { name: priceInfo?.pools?.name || "Unknown", openUnits: 0, closeUnits: 0, openPrice: Number(priceInfo?.unit_price_sell || 0), closePrice: 0 };
    }
    poolSummary[poolId].openUnits += Number(row.total_units);
  }

  for (const row of data.closingUnits) {
    const poolId = row.pool_id;
    const priceInfo = data.poolPricesEnd[poolId];
    if (!poolSummary[poolId]) {
      poolSummary[poolId] = { name: priceInfo?.pools?.name || "Unknown", openUnits: 0, closeUnits: 0, openPrice: 0, closePrice: Number(priceInfo?.unit_price_sell || 0) };
    }
    poolSummary[poolId].closeUnits += Number(row.total_units);
    poolSummary[poolId].closePrice = Number(priceInfo?.unit_price_sell || 0);
  }

  const activePools = Object.entries(poolSummary).filter(([, p]) => {
    const openVal = Math.abs(p.openUnits * p.openPrice);
    const closeVal = Math.abs(p.closeUnits * p.closePrice);
    return openVal > 0.001 || closeVal > 0.001;
  });

  const openTotal = activePools.reduce((s, [, p]) => s + p.openUnits * p.openPrice, 0);
  const closeTotal = activePools.reduce((s, [, p]) => s + p.closeUnits * p.closePrice, 0);
  const changeTotal = closeTotal - openTotal;

  const summaryRows = activePools.map(([, p]) => {
    const openVal = p.openUnits * p.openPrice;
    const closeVal = p.closeUnits * p.closePrice;
    const change = closeVal - openVal;
    return `<tr>
      <td>${p.name}</td>
      <td class="num">${p.openUnits.toFixed(4)}</td>
      <td class="num">${formatCurrency(p.openPrice, sym)}</td>
      <td class="num">${formatCurrency(openVal, sym)}</td>
      <td class="num">${p.closeUnits.toFixed(4)}</td>
      <td class="num">${formatCurrency(p.closePrice, sym)}</td>
      <td class="num">${formatCurrency(closeVal, sym)}</td>
      <td class="num ${change < 0 ? 'neg' : ''}">${formatCurrency(change, sym)}</td>
    </tr>`;
  }).join("");

  const unitRows = data.unitTransactions.map((tx: any) => {
    const debit = Number(tx.debit || 0);
    const credit = Number(tx.credit || 0);
    return `<tr>
      <td>${fmtDate(tx.transaction_date)}</td>
      <td>${tx.transaction_type || ""}</td>
      <td>${tx.pools?.name || ""}</td>
      <td class="num">${debit > 0 ? debit.toFixed(4) : ""}</td>
      <td class="num">${credit > 0 ? credit.toFixed(4) : ""}</td>
      <td class="num">${formatCurrency(Number(tx.unit_price || 0), sym)}</td>
      <td class="num">${formatCurrency(Number(tx.value || 0), sym)}</td>
      <td>${tx.notes || ""}</td>
    </tr>`;
  }).join("");

  const cashRows = data.cashflowTransactions.map((tx: any) => {
    const debit = Number(tx.debit || 0);
    const credit = Number(tx.credit || 0);
    return `<tr>
      <td>${fmtDate(tx.transaction_date)}</td>
      <td>${tx.description || tx.entry_type || ""}</td>
      <td>${tx.pool_name || ""}</td>
      <td class="num">${debit > 0 ? formatCurrency(debit, sym) : ""}</td>
      <td class="num">${credit > 0 ? formatCurrency(credit, sym) : ""}</td>
    </tr>`;
  }).join("");

  const cashDebitTotal = data.cashflowTransactions.reduce((s: number, tx: any) => s + Number(tx.debit || 0), 0);
  const cashCreditTotal = data.cashflowTransactions.reduce((s: number, tx: any) => s + Number(tx.credit || 0), 0);

  const stockRows = data.stockTransactions.map((tx: any) => {
    const debit = Number(tx.debit || 0);
    const credit = Number(tx.credit || 0);
    return `<tr>
      <td>${fmtDate(tx.transaction_date)}</td>
      <td>${debit > 0 ? "Stock Deposit" : credit > 0 ? "Stock Withdrawal" : (tx.stock_transaction_type || "")}</td>
      <td>${tx.items?.description || ""}</td>
      <td>${tx.pools?.name || ""}</td>
      <td class="num">${debit > 0 ? debit.toFixed(4) : ""}</td>
      <td class="num">${credit > 0 ? credit.toFixed(4) : ""}</td>
      <td class="num">${formatCurrency(Number(tx.total_value || 0), sym)}</td>
    </tr>`;
  }).join("");

  const hasLoanData = data.loanOutstanding > 0 || data.loanPayout > 0;

  return `<!DOCTYPE html>
<html><head>
<title>Member Statement - ${memberName}</title>
<style>
  @page { margin: 15mm; size: A4; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 9pt; line-height: 1.4; color: #1a1a1a; max-width: 780px; margin: 0 auto; padding: 16px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1e3a5f; padding-bottom: 12px; margin-bottom: 16px; }
  .header-left { display: flex; align-items: center; gap: 12px; }
  .header-left img { max-height: 60px; max-width: 120px; object-fit: contain; }
  .coop-name { font-size: 14pt; font-weight: bold; color: #1e3a5f; }
  .coop-details { font-size: 7.5pt; color: #666; line-height: 1.5; }
  .header-right { text-align: right; font-size: 7.5pt; color: #666; line-height: 1.5; }
  .member-info { display: flex; justify-content: space-between; background: #f5f7fa; border: 1px solid #e0e4ea; border-radius: 6px; padding: 10px 14px; margin-bottom: 16px; }
  .member-info .label { font-size: 7pt; text-transform: uppercase; letter-spacing: 0.5px; color: #888; }
  .member-info .val { font-weight: 600; font-size: 9pt; }
  .section { margin-top: 18px; }
  .section-title { font-size: 11pt; font-weight: bold; color: #1e3a5f; border-bottom: 1px solid #c8d0da; padding-bottom: 4px; margin-bottom: 8px; }
  .period { font-size: 8pt; color: #888; font-weight: normal; margin-left: 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 8pt; margin-bottom: 4px; }
  thead { background: #1e3a5f; color: white; }
  th { padding: 5px 6px; text-align: left; font-weight: 600; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.3px; }
  th.num { text-align: right; }
  td { padding: 4px 6px; border-bottom: 1px solid #eee; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  td.neg { color: #dc2626; }
  tr.total { background: #f0f2f5; font-weight: bold; }
  tr.total td { border-top: 2px solid #1e3a5f; border-bottom: none; }
  .summary-cards { display: flex; gap: 12px; margin-bottom: 6px; }
  .scard { flex: 1; background: #f5f7fa; border: 1px solid #e0e4ea; border-radius: 6px; padding: 8px 12px; text-align: center; }
  .scard .lbl { font-size: 7pt; text-transform: uppercase; color: #888; }
  .scard .amt { font-size: 14pt; font-weight: bold; color: #1e3a5f; }
  .scard .amt.neg { color: #dc2626; }
  .scard .amt.pos { color: #16a34a; }
  .footer { margin-top: 20px; border-top: 1px solid #c8d0da; padding-top: 8px; font-size: 7pt; color: #888; text-align: center; line-height: 1.6; }
  .empty-msg { padding: 12px; text-align: center; color: #888; font-style: italic; }
</style>
</head>
<body>
<div class="header">
  <div class="header-left">
    ${logoUrl ? `<img src="${logoUrl}" alt="Logo" />` : ""}
    <div>
      <div class="coop-name">${coopName}</div>
      <div class="coop-details">
        ${coopRegNo ? `Reg No: ${coopRegNo}<br/>` : ""}
        ${vatNumber ? `VAT: ${vatNumber}<br/>` : ""}
        ${coopAddr ? `${coopAddr}<br/>` : ""}
      </div>
    </div>
  </div>
  <div class="header-right">
    ${coopPhone ? `Tel: ${coopPhone}<br/>` : ""}
    ${coopEmail ? `${coopEmail}<br/>` : ""}
  </div>
</div>

<div class="member-info">
  <div class="col">
    <div class="label">Member</div>
    <div class="val">${memberName}</div>
    ${category ? `<div style="font-size:7.5pt;color:#666">${category}</div>` : ""}
  </div>
  <div class="col">
    <div class="label">ID / Reg No</div>
    <div class="val">${memberId}</div>
  </div>
  <div class="col">
    <div class="label">Account No</div>
    <div class="val">${accountNumber}</div>
  </div>
  <div class="col">
    <div class="label">Address</div>
    <div class="val" style="font-size:7.5pt;max-width:200px">${memberAddr || "—"}</div>
  </div>
</div>

<div class="section">
  <div class="section-title">Portfolio Summary <span class="period">${fmtDate(data.fromDate)} — ${fmtDate(data.toDate)}</span></div>
  <div class="summary-cards">
    <div class="scard">
      <div class="lbl">Opening Value</div>
      <div class="amt">${formatCurrency(openTotal, sym)}</div>
    </div>
    <div class="scard">
      <div class="lbl">Closing Value</div>
      <div class="amt">${formatCurrency(closeTotal, sym)}</div>
    </div>
    <div class="scard">
      <div class="lbl">Change in Value</div>
      <div class="amt ${changeTotal < 0 ? 'neg' : 'pos'}">${changeTotal >= 0 ? '+' : ''}${formatCurrency(changeTotal, sym)}</div>
    </div>
    ${data.loanOutstanding > 0 ? `<div class="scard">
      <div class="lbl">O/s Loan</div>
      <div class="amt neg">${formatCurrency(data.loanOutstanding, sym)}</div>
    </div>` : ""}
  </div>

  <table>
    <thead><tr>
      <th>Pool</th><th class="num">Open Units</th><th class="num">Open Price</th><th class="num">Open Value</th>
      <th class="num">Close Units</th><th class="num">Close Price</th><th class="num">Close Value</th><th class="num">Change</th>
    </tr></thead>
    <tbody>
      ${summaryRows || '<tr><td colspan="8" class="empty-msg">No pool data for this period</td></tr>'}
      ${summaryRows ? `<tr class="total">
        <td>Total</td><td></td><td></td><td class="num">${formatCurrency(openTotal, sym)}</td>
        <td></td><td></td><td class="num">${formatCurrency(closeTotal, sym)}</td>
        <td class="num ${changeTotal < 0 ? 'neg' : ''}">${changeTotal >= 0 ? '+' : ''}${formatCurrency(changeTotal, sym)}</td>
      </tr>` : ""}
    </tbody>
  </table>
</div>

<div class="section">
  <div class="section-title">Unit Movements</div>
  ${data.unitTransactions.length > 0 ? `<table>
    <thead><tr><th>Date</th><th>Type</th><th>Pool</th><th class="num">In (Debit)</th><th class="num">Out (Credit)</th><th class="num">Unit Price</th><th class="num">Value</th><th>Notes</th></tr></thead>
    <tbody>${unitRows}</tbody>
  </table>` : '<div class="empty-msg">No unit movements in this period</div>'}
</div>

<div class="section">
  <div class="section-title">Cash Flows</div>
  ${data.cashflowTransactions.length > 0 ? `<table>
    <thead><tr><th>Date</th><th>Type</th><th>Pool</th><th class="num">Debit</th><th class="num">Credit</th></tr></thead>
    <tbody>
      ${cashRows}
      <tr class="total">
        <td colspan="3">Total</td>
        <td class="num">${formatCurrency(cashDebitTotal, sym)}</td>
        <td class="num">${formatCurrency(cashCreditTotal, sym)}</td>
      </tr>
    </tbody>
  </table>` : '<div class="empty-msg">No cash flows in this period</div>'}
</div>

<div class="section">
  <div class="section-title">Stock Flows</div>
  ${data.stockTransactions.length > 0 ? `<table>
    <thead><tr><th>Date</th><th>Type</th><th>Item</th><th>Pool</th><th class="num">In</th><th class="num">Out</th><th class="num">Value</th></tr></thead>
    <tbody>${stockRows}</tbody>
  </table>` : '<div class="empty-msg">No stock flows in this period</div>'}
</div>

${hasLoanData ? `<div class="section">
  <div class="section-title">Loans & Grants</div>
  <table>
    <thead><tr><th>Description</th><th class="num">Amount</th></tr></thead>
    <tbody>
      <tr><td>Total Disbursed</td><td class="num">${formatCurrency(data.loanPayout, sym)}</td></tr>
      <tr><td>Total Repaid</td><td class="num">${formatCurrency(data.loanRepaid, sym)}</td></tr>
      <tr class="total"><td>Outstanding Balance</td><td class="num ${data.loanOutstanding > 0 ? 'neg' : ''}">${formatCurrency(data.loanOutstanding, sym)}</td></tr>
    </tbody>
  </table>
</div>` : ""}

<div class="footer">
  ${coopName}${coopRegNo ? ` | Reg No: ${coopRegNo}` : ""}${vatNumber ? ` | VAT: ${vatNumber}` : ""}<br/>
  ${coopAddr ? `${coopAddr}<br/>` : ""}
  ${directors ? `Directors: ${directors}<br/>` : ""}
  Statement generated on ${new Date().toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}
</div>

</body></html>`;
}

async function generateStatementForEntity(
  adminClient: any,
  tenantId: string,
  entityId: string,
  entityAccountIds: string[],
  fromStr: string,
  toStr: string,
  currencySymbol: string,
): Promise<string | null> {
  try {
    const dayBeforeFrom = new Date(new Date(fromStr + "T00:00:00").getTime() - 86400000);
    const dayBeforeFromStr = dayBeforeFrom.toISOString().split("T")[0];

    const [
      entityRes, accountsRes, tenantConfigRes, unitTxRes, cashflowTxRes, stockTxRes,
      loanRes, poolPricesStartRes, poolPricesEndRes, legacyCftRes,
    ] = await Promise.all([
      adminClient.from("entities").select("id, name, last_name, identity_number, registration_number, contact_number, email_address, entity_categories (name)").eq("id", entityId).single(),
      adminClient.from("entity_accounts").select("id, account_number, entity_account_types (name, account_type)").eq("entity_id", entityId).eq("tenant_id", tenantId),
      adminClient.from("tenant_configuration").select("logo_url, directors, vat_number, registration_date, currency_symbol, legal_entity_id, entities:legal_entity_id (name, registration_number, contact_number, email_address)").eq("tenant_id", tenantId).maybeSingle(),
      adminClient.from("unit_transactions").select("id, transaction_date, transaction_type, pool_id, debit, credit, unit_price, value, notes, pools (name)").eq("tenant_id", tenantId).in("entity_account_id", entityAccountIds).gte("transaction_date", fromStr).lte("transaction_date", toStr).eq("is_active", true).order("transaction_date", { ascending: true }),
      adminClient.from("cashflow_transactions").select("id, transaction_date, entry_type, description, debit, credit, notes, pools (name)").eq("tenant_id", tenantId).in("entity_account_id", entityAccountIds).gte("transaction_date", fromStr).lte("transaction_date", toStr).eq("is_active", true).eq("is_bank", true).order("transaction_date", { ascending: true }),
      adminClient.from("stock_transactions").select("id, transaction_date, transaction_type, stock_transaction_type, debit, credit, cost_price, total_value, notes, items (description), pools (name)").eq("tenant_id", tenantId).in("entity_account_id", entityAccountIds).gte("transaction_date", fromStr).lte("transaction_date", toStr).eq("is_active", true).order("transaction_date", { ascending: true }),
      adminClient.rpc("get_loan_outstanding", { p_tenant_id: tenantId }),
      adminClient.from("daily_pool_prices").select("pool_id, unit_price_sell, totals_date, pools (name)").eq("tenant_id", tenantId).lte("totals_date", fromStr).order("totals_date", { ascending: false }).limit(50),
      adminClient.from("daily_pool_prices").select("pool_id, unit_price_sell, totals_date, pools (name)").eq("tenant_id", tenantId).lte("totals_date", toStr).order("totals_date", { ascending: false }).limit(50),
      adminClient.rpc("get_legacy_cft_for_entity", { p_tenant_id: tenantId, p_entity_id: entityId, p_from_date: fromStr, p_to_date: toStr }),
    ]);

    const legalEntityId = tenantConfigRes.data?.legal_entity_id;
    let legalAddress: any = null;
    if (legalEntityId) {
      const { data: addrData } = await adminClient.from("addresses").select("street_address, suburb, city, province, postal_code").eq("entity_id", legalEntityId).eq("tenant_id", tenantId).eq("is_primary", true).maybeSingle();
      legalAddress = addrData;
    }

    const { data: memberAddr } = await adminClient.from("addresses").select("street_address, suburb, city, province, postal_code").eq("entity_id", entityId).eq("tenant_id", tenantId).eq("is_primary", true).maybeSingle();

    const { data: openingUnitsData } = await adminClient.rpc("get_account_pool_units", { p_tenant_id: tenantId, p_up_to_date: dayBeforeFromStr });
    const { data: closingUnitsData } = await adminClient.rpc("get_account_pool_units", { p_tenant_id: tenantId, p_up_to_date: toStr });

    const accountSet = new Set(entityAccountIds);
    const openingUnits = (openingUnitsData ?? []).filter((r: any) => accountSet.has(r.entity_account_id));
    const closingUnits = (closingUnitsData ?? []).filter((r: any) => accountSet.has(r.entity_account_id));

    const dedup = (rows: any[]) => {
      const map: Record<string, any> = {};
      for (const r of rows ?? []) { if (!map[r.pool_id]) map[r.pool_id] = r; }
      return map;
    };

    const loanRow = (loanRes.data ?? []).find((r: any) => r.entity_id === entityId);

    const filteredUnitTx = (unitTxRes.data ?? []).filter((tx: any) => {
      const debit = Number(tx.debit || 0);
      const credit = Number(tx.credit || 0);
      const value = Number(tx.value || 0);
      return debit !== 0 || credit !== 0 || value !== 0;
    });

    const currentCft = (cashflowTxRes.data ?? []).map((tx: any) => ({
      transaction_date: tx.transaction_date,
      entry_type: tx.entry_type || "",
      description: tx.description || "",
      pool_name: tx.pools?.name || "",
      debit: Number(tx.debit || 0),
      credit: Number(tx.credit || 0),
    }));
    const legacyCft = (legacyCftRes.data ?? []).map((tx: any) => ({
      transaction_date: tx.transaction_date ? tx.transaction_date.substring(0, 10) : "",
      entry_type: tx.entry_type || "",
      description: tx.description || "",
      pool_name: tx.pool_name || "",
      debit: Number(tx.debit || 0),
      credit: Number(tx.credit || 0),
    }));
    const allCashflows = [...currentCft, ...legacyCft]
      .filter((tx) => tx.debit !== 0 || tx.credit !== 0)
      .sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));

    return generateStatementHtml({
      fromDate: fromStr,
      toDate: toStr,
      currencySymbol,
      entity: entityRes.data,
      entityAccounts: accountsRes.data ?? [],
      memberAddress: memberAddr,
      tenantConfig: tenantConfigRes.data,
      legalEntity: tenantConfigRes.data?.entities,
      legalAddress,
      unitTransactions: filteredUnitTx,
      cashflowTransactions: allCashflows,
      stockTransactions: stockTxRes.data ?? [],
      loanOutstanding: Number(loanRow?.outstanding ?? 0),
      loanPayout: Number(loanRow?.total_payout ?? 0),
      loanRepaid: Number(loanRow?.total_repaid ?? 0),
      openingUnits,
      closingUnits,
      poolPricesStart: dedup(poolPricesStartRes.data),
      poolPricesEnd: dedup(poolPricesEndRes.data),
    });
  } catch (err: any) {
    console.error("[send-member-statement] Statement generation failed:", err.message);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify the caller's JWT
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsErr } = await anonClient.auth.getClaims(
      authHeader.replace("Bearer ", "")
    );
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { tenant_id, entity_id, from_date, to_date } = await req.json();

    if (!tenant_id || !entity_id || !from_date || !to_date) {
      return new Response(JSON.stringify({ error: "tenant_id, entity_id, from_date, and to_date are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Get entity accounts
    const { data: allAccounts } = await adminClient
      .from("entity_accounts")
      .select("id")
      .eq("entity_id", entity_id)
      .eq("tenant_id", tenant_id);
    const entityAccountIds = (allAccounts ?? []).map((a: any) => a.id);

    if (entityAccountIds.length === 0) {
      return new Response(JSON.stringify({ error: "No accounts found for this entity" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get tenant config for currency symbol and SMTP
    const { data: tenantConfig } = await adminClient
      .from("tenant_configuration")
      .select("smtp_host, smtp_port, smtp_username, smtp_password, smtp_from_email, smtp_from_name, smtp_enable_ssl, currency_symbol, legal_entity_id, email_signature_en, email_signature_af")
      .eq("tenant_id", tenant_id)
      .maybeSingle();

    if (!tenantConfig?.smtp_host || !tenantConfig?.smtp_from_email) {
      return new Response(JSON.stringify({ error: "SMTP not configured" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const currSym = tenantConfig.currency_symbol || "R";

    // Generate statement HTML
    const statementHtml = await generateStatementForEntity(
      adminClient, tenant_id, entity_id, entityAccountIds, from_date, to_date, currSym,
    );

    if (!statementHtml) {
      return new Response(JSON.stringify({ error: "Failed to generate statement" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get entity email address
    const { data: entityData } = await adminClient
      .from("entities")
      .select("email_address, name, last_name")
      .eq("id", entity_id)
      .single();

    const entityEmail = entityData?.email_address;
    const memberName = [entityData?.name, entityData?.last_name].filter(Boolean).join(" ");

    if (!entityEmail) {
      return new Response(JSON.stringify({ error: "No email address found for this member" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get tenant name
    const { data: tenant } = await adminClient.from("tenants").select("name").eq("id", tenant_id).single();
    let tenantName = tenant?.name || "the cooperative";
    if (tenantConfig.legal_entity_id) {
      const { data: le } = await adminClient.from("entities").select("name").eq("id", tenantConfig.legal_entity_id).single();
      if (le?.name) tenantName = le.name;
    }

    // Build email body
    const subject = `Member Statement — ${memberName} (${fmtDate(from_date)} to ${fmtDate(to_date)})`;
    const emailBody = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <h2 style="color:#1e3a5f;">Member Statement</h2>
        <p>Dear ${entityData?.name || "Member"},</p>
        <p>Please find your member statement for the period <strong>${fmtDate(from_date)}</strong> to <strong>${fmtDate(to_date)}</strong> attached to this email.</p>
        <p>You can open the attached HTML file in any browser and use "Print → Save as PDF" to save a PDF copy.</p>
        <p style="color:#666;font-size:13px;margin-top:24px;">Kind regards,<br/>${tenantName}</p>
      </div>`;

    // Setup SMTP transport
    const requestedPort = tenantConfig.smtp_port || 587;
    const usePort = requestedPort === 465 ? 587 : requestedPort;

    const transporter = nodemailer.createTransport({
      host: tenantConfig.smtp_host,
      port: usePort,
      secure: false,
      ignoreTLS: true,
      auth: tenantConfig.smtp_username
        ? { user: tenantConfig.smtp_username, pass: tenantConfig.smtp_password || "" }
        : undefined,
    });

    const isSmtpUserEmail = tenantConfig.smtp_username?.includes("@");
    const effectiveFromEmail = isSmtpUserEmail ? tenantConfig.smtp_username : tenantConfig.smtp_from_email;
    const fromHeader = tenantConfig.smtp_from_name
      ? `"${tenantConfig.smtp_from_name}" <${effectiveFromEmail}>`
      : effectiveFromEmail;

    // Send email with statement attachment
    const info = await transporter.sendMail({
      from: fromHeader,
      to: entityEmail,
      subject,
      html: emailBody,
      attachments: [{
        filename: `Statement_${memberName.replace(/\s+/g, "_")}_${from_date}_to_${to_date}.html`,
        content: statementHtml,
        contentType: "text/html",
      }],
    });

    // Log to email_logs
    try {
      await adminClient.from("email_logs").insert({
        tenant_id,
        recipient_email: entityEmail,
        application_event: "member_statement",
        subject,
        status: "sent",
        message_id: info.messageId,
        metadata: { entity_id, from_date, to_date },
      });
    } catch (logErr: any) {
      console.warn("[send-member-statement] Failed to log email:", logErr.message);
    }

    console.log(`[send-member-statement] Statement emailed to ${entityEmail} (${info.messageId})`);

    return new Response(
      JSON.stringify({ success: true, recipient: entityEmail, message_id: info.messageId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[send-member-statement] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
