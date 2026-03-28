import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.10";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Afrikaans translations for transaction types
const TX_TYPE_AF: Record<string, string> = {
  "Deposit": "Deposito",
  "Stock Deposit": "Voorraad Deposito",
  "Withdrawal": "Onttrekking",
  "Stock Withdrawal": "Voorraad Onttrekking",
  "Switch": "Omskakeling",
  "Transfer": "Oordrag",
  "Transfer Received": "Oordrag Ontvang",
  "Stock Purchase": "Voorraad Aankoop",
  "Stock Sale": "Voorraad Verkoop",
  "Stock Adjustment": "Voorraad Aanpassing",
};

// ─── Currency formatter (mirrors client-side formatCurrency) ───
function formatCurrency(value: number, symbol = "R", decimals = 2): string {
  const isNegative = value < 0;
  const abs = Math.abs(value);
  const fixed = abs.toFixed(decimals);
  const [intPart, decPart] = fixed.split(".");
  const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${isNegative ? "-" : ""}${symbol} ${formatted}.${decPart}`;
}

// ─── Date formatter ───
function fmtDate(d: string): string {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── Statement HTML generator (server-side version) ───
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

  // Calculate summary
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
    ${directors ? `<br/><strong>Directors:</strong><br/>${directors.replace(/,/g, "<br/>")}` : ""}
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

// ─── Helper: generate statement data for an entity ───
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
      entityRes,
      accountsRes,
      tenantConfigRes,
      unitTxRes,
      cashflowTxRes,
      stockTxRes,
      loanRes,
      poolPricesStartRes,
      poolPricesEndRes,
      legacyCftRes,
    ] = await Promise.all([
      adminClient.from("entities").select("id, name, last_name, identity_number, registration_number, contact_number, email_address, entity_categories (name)").eq("id", entityId).single(),
      adminClient.from("entity_accounts").select("id, account_number, entity_account_types (name, account_type)").eq("entity_id", entityId).eq("tenant_id", tenantId),
      adminClient.from("tenant_configuration").select("logo_url, directors, vat_number, registration_date, currency_symbol, legal_entity_id, entities:legal_entity_id (name, registration_number, contact_number, email_address)").eq("tenant_id", tenantId).maybeSingle(),
      adminClient.from("unit_transactions").select("id, transaction_date, transaction_type, pool_id, debit, credit, unit_price, value, notes, pools (name)").eq("tenant_id", tenantId).in("entity_account_id", entityAccountIds).gte("transaction_date", fromStr).lte("transaction_date", toStr).eq("is_active", true).order("transaction_date", { ascending: true }),
      adminClient.from("cashflow_transactions").select("id, transaction_date, entry_type, description, debit, credit, notes, pools (name)").eq("tenant_id", tenantId).in("entity_account_id", entityAccountIds).gte("transaction_date", fromStr).lte("transaction_date", toStr).eq("is_active", true).or("is_bank.eq.true,entry_type.in.(share,membership_fee,fee)").order("transaction_date", { ascending: true }),
      adminClient.from("stock_transactions").select("id, transaction_date, transaction_type, stock_transaction_type, debit, credit, cost_price, total_value, notes, items (description), pools (name)").eq("tenant_id", tenantId).in("entity_account_id", entityAccountIds).gte("transaction_date", fromStr).lte("transaction_date", toStr).eq("is_active", true).order("transaction_date", { ascending: true }),
      adminClient.rpc("get_loan_outstanding", { p_tenant_id: tenantId }),
      adminClient.from("daily_pool_prices").select("pool_id, unit_price_sell, totals_date, pools (name)").eq("tenant_id", tenantId).lte("totals_date", fromStr).order("totals_date", { ascending: false }).limit(50),
      adminClient.from("daily_pool_prices").select("pool_id, unit_price_sell, totals_date, pools (name)").eq("tenant_id", tenantId).lte("totals_date", toStr).order("totals_date", { ascending: false }).limit(50),
      adminClient.rpc("get_legacy_cft_for_entity", { p_tenant_id: tenantId, p_entity_id: entityId, p_from_date: fromStr, p_to_date: toStr }),
    ]);

    // Fetch legal entity address
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
      for (const r of rows ?? []) {
        if (!map[r.pool_id]) map[r.pool_id] = r;
      }
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
    console.error("[send-transaction-email] Statement generation failed:", err.message);
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

    const {
      tenant_id,
      user_id,
      application_event,
      transaction_data,
    } = await req.json();

    if (!tenant_id || !user_id || !application_event) {
      return new Response(JSON.stringify({ error: "tenant_id, user_id, and application_event are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch member profile (may not exist for entity-only users)
    const { data: profile } = await adminClient
      .from("profiles")
      .select("first_name, last_name, email, language_code")
      .eq("user_id", user_id)
      .maybeSingle();

    // If no profile email, try to resolve from the user's linked entity
    let recipientEmail = profile?.email || null;
    let recipientName = profile?.first_name || "";
    let recipientLastName = profile?.last_name || "";
    let recipientLang = profile?.language_code || "en";

    if (!recipientEmail) {
      // Look up entity email via user_entity_relationships
      const { data: uer } = await adminClient
        .from("user_entity_relationships")
        .select("entity_id, entities!inner(name, last_name, email_address, language_code)")
        .eq("user_id", user_id)
        .eq("tenant_id", tenant_id)
        .limit(1)
        .maybeSingle();
      const ent = (uer as any)?.entities;
      if (ent?.email_address) {
        recipientEmail = ent.email_address;
        recipientName = recipientName || ent.name || "";
        recipientLastName = recipientLastName || ent.last_name || "";
        recipientLang = ent.language_code || recipientLang;
        console.log(`[send-transaction-email] Using entity email ${recipientEmail} for user ${user_id}`);
      }
    }

    if (!recipientEmail) {
      console.warn(`[send-transaction-email] No email found for user ${user_id} (checked profiles + entities)`);
      return new Response(JSON.stringify({ success: false, error: "No member email" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch tenant info
    const { data: tenant } = await adminClient
      .from("tenants")
      .select("name")
      .eq("id", tenant_id)
      .single();

    // Fetch tenant SMTP configuration
    const { data: tenantConfig } = await adminClient
      .from("tenant_configuration")
      .select("smtp_host, smtp_port, smtp_username, smtp_password, smtp_from_email, smtp_from_name, smtp_enable_ssl, email_signature_en, email_signature_af, legal_entity_id, currency_symbol")
      .eq("tenant_id", tenant_id)
      .maybeSingle();

    // Determine SMTP: tenant config → head office → GLOBAL_SMTP_* env secrets
    let smtpHost = tenantConfig?.smtp_host || null;
    let smtpPort = tenantConfig?.smtp_port || null;
    let smtpUsername = tenantConfig?.smtp_username || null;
    let smtpPassword = tenantConfig?.smtp_password || null;
    let smtpFromEmail = tenantConfig?.smtp_from_email || null;
    let smtpFromName = tenantConfig?.smtp_from_name || null;

    if (!smtpHost || !smtpFromEmail) {
      console.log("[send-transaction-email] Tenant SMTP not configured, falling back to head office");
      const { data: hoSettings } = await adminClient
        .from("head_office_settings")
        .select("smtp_host, smtp_port, smtp_username, smtp_password, smtp_from_email, smtp_from_name, company_name")
        .limit(1)
        .maybeSingle();

      if (hoSettings?.smtp_host && hoSettings?.smtp_from_email) {
        smtpHost = hoSettings.smtp_host;
        smtpPort = hoSettings.smtp_port;
        smtpUsername = hoSettings.smtp_username;
        smtpPassword = hoSettings.smtp_password;
        smtpFromEmail = hoSettings.smtp_from_email;
        smtpFromName = hoSettings.smtp_from_name || hoSettings.company_name;
        console.log("[send-transaction-email] Using head office SMTP settings");
      } else {
        const envHost = Deno.env.get("GLOBAL_SMTP_HOST");
        const envUsername = Deno.env.get("GLOBAL_SMTP_USERNAME");
        if (envHost && envUsername) {
          smtpHost = envHost;
          smtpPort = parseInt(Deno.env.get("GLOBAL_SMTP_PORT") || "587", 10);
          smtpUsername = envUsername;
          smtpPassword = Deno.env.get("GLOBAL_SMTP_PASSWORD") || "";
          smtpFromEmail = envUsername;
          smtpFromName = Deno.env.get("GLOBAL_SMTP_FROM_NAME") || hoSettings?.company_name || "My Co-op";
          console.log("[send-transaction-email] Using GLOBAL_SMTP_* env secrets");
        } else {
          console.warn("[send-transaction-email] No SMTP configured in tenant, head office, or env");
          return new Response(JSON.stringify({ success: false, error: "SMTP not configured" }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    // Resolve admin email from the legal entity
    let adminNotifyEmail: string | null = null;
    if (tenantConfig.legal_entity_id) {
      const { data: legalEntity } = await adminClient
        .from("entities")
        .select("email_address")
        .eq("id", tenantConfig.legal_entity_id)
        .single();
      adminNotifyEmail = legalEntity?.email_address || null;
    }

    // Resolve entity email + name
    const txn = transaction_data || {};
    let entityEmail: string | null = null;
    let entityAccountName = "";
    let entityId: string | null = null;
    let entityAccountIds: string[] = [];

    if (txn.account_number) {
      const { data: entityAcct } = await adminClient
        .from("entity_accounts")
        .select("entity_id")
        .eq("tenant_id", tenant_id)
        .eq("account_number", txn.account_number)
        .maybeSingle();
      if (entityAcct?.entity_id) {
        entityId = entityAcct.entity_id;
        const { data: entity } = await adminClient
          .from("entities")
          .select("email_address, name, last_name")
          .eq("id", entityAcct.entity_id)
          .single();
        entityEmail = entity?.email_address || null;
        entityAccountName = [entity?.name, entity?.last_name].filter(Boolean).join(" ");

        // Fetch all account IDs for this entity (needed for statement)
        const { data: allAccounts } = await adminClient
          .from("entity_accounts")
          .select("id")
          .eq("entity_id", entityAcct.entity_id)
          .eq("tenant_id", tenant_id);
        entityAccountIds = (allAccounts ?? []).map((a: any) => a.id);
      }
    }

    // ── Generate 30-day statement attachment ──
    let statementHtml: string | null = null;
    if (entityId && entityAccountIds.length > 0) {
      // Use SAST (UTC+2) so "today" matches the tenant's local date
      const now = new Date();
      const sastNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      const toStr = sastNow.toISOString().split("T")[0];
      const fromDate = new Date(sastNow.getTime() - 30 * 86400000);
      const fromStr = fromDate.toISOString().split("T")[0];
      const currSym = (tenantConfig as any).currency_symbol || "R";

      statementHtml = await generateStatementForEntity(
        adminClient,
        tenant_id,
        entityId,
        entityAccountIds,
        fromStr,
        toStr,
        currSym,
      );
      if (statementHtml) {
        console.log(`[send-transaction-email] Statement generated for entity ${entityId}`);
      }
    }

    // Fetch communication template
    const userLang = recipientLang;
    let template: { subject: string; body_html: string } | null = null;

    const { data: customLangTemplate } = await adminClient
      .from("communication_templates")
      .select("subject, body_html")
      .eq("tenant_id", tenant_id)
      .eq("application_event", application_event)
      .eq("is_active", true)
      .eq("is_email_active", true)
      .eq("is_system_default", false)
      .eq("language_code", userLang)
      .maybeSingle();
    template = customLangTemplate;

    if (!template && userLang !== "en") {
      const { data: customEnTemplate } = await adminClient
        .from("communication_templates")
        .select("subject, body_html")
        .eq("tenant_id", tenant_id)
        .eq("application_event", application_event)
        .eq("is_active", true)
        .eq("is_email_active", true)
        .eq("is_system_default", false)
        .eq("language_code", "en")
        .maybeSingle();
      template = customEnTemplate;
    }

    if (!template) {
      const { data: sysLangTemplate } = await adminClient
        .from("communication_templates")
        .select("subject, body_html")
        .eq("tenant_id", tenant_id)
        .eq("application_event", application_event)
        .eq("is_active", true)
        .eq("is_email_active", true)
        .eq("is_system_default", true)
        .eq("language_code", userLang)
        .maybeSingle();
      template = sysLangTemplate;
    }

    if (!template && userLang !== "en") {
      const { data: sysEnTemplate } = await adminClient
        .from("communication_templates")
        .select("subject, body_html")
        .eq("tenant_id", tenant_id)
        .eq("application_event", application_event)
        .eq("is_active", true)
        .eq("is_email_active", true)
        .eq("is_system_default", true)
        .eq("language_code", "en")
        .maybeSingle();
      template = sysEnTemplate;
    }

    // Fetch email footer
    const { data: footerTemplate } = await adminClient
      .from("communication_templates")
      .select("body_html")
      .eq("tenant_id", tenant_id)
      .eq("application_event", "email_footer")
      .eq("is_active", true)
      .eq("is_email_active", true)
      .eq("language_code", userLang)
      .maybeSingle();

    const footerHtml = footerTemplate?.body_html || "";

    const firstName = recipientName || "Member";
    const lastName = recipientLastName;

    // Resolve tenant display name
    let tenantName = tenant?.name || "the cooperative";
    if (tenantConfig.legal_entity_id) {
      const { data: legalEntity } = await adminClient
        .from("entities")
        .select("name")
        .eq("id", tenantConfig.legal_entity_id)
        .single();
      if (legalEntity?.name) tenantName = legalEntity.name;
    }

    // Translate transaction type
    const rawTxnType = txn.transaction_type || "";
    const translatedTxnType = userLang === "af"
      ? (TX_TYPE_AF[rawTxnType] || rawTxnType)
      : rawTxnType;

    const defaultSubject = `Transaction Confirmation — ${translatedTxnType || application_event}`;
    const defaultBody = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <h2 style="color:#1a1a2e;">${userLang === "af" ? "Transaksie Bevestiging" : "Transaction Confirmation"}</h2>
        <p>${userLang === "af" ? "Geagte" : "Dear"} ${firstName},</p>
        <p>${userLang === "af" ? "U" : "Your"} <strong>${translatedTxnType || (userLang === "af" ? "transaksie" : "transaction")}</strong> ${userLang === "af" ? "is goedgekeur." : "has been approved."}</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:6px 0;color:#666;">${userLang === "af" ? "Datum" : "Date"}:</td><td style="padding:6px 0;font-weight:600;">${txn.transaction_date || "N/A"}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">${userLang === "af" ? "Tipe" : "Type"}:</td><td style="padding:6px 0;font-weight:600;">${translatedTxnType}</td></tr>
          ${entityAccountName ? `<tr><td style="padding:6px 0;color:#666;">${userLang === "af" ? "Rekening Naam" : "Account Name"}:</td><td style="padding:6px 0;font-weight:600;">${entityAccountName}</td></tr>` : ""}
          <tr><td style="padding:6px 0;color:#666;">${userLang === "af" ? "Rekening Nommer" : "Account Number"}:</td><td style="padding:6px 0;font-weight:600;">${txn.account_number || "N/A"}</td></tr>
        </table>
      </div>`;

    let subject = template?.subject || defaultSubject;
    let body = template?.body_html || defaultBody;

    if (footerHtml) {
      body = body + footerHtml;
    }

    const resolvedSignature = userLang === "af"
      ? ((tenantConfig as any).email_signature_af || (tenantConfig as any).email_signature_en || "")
      : ((tenantConfig as any).email_signature_en || "");

    const replacements: Record<string, string> = {
      "{{entity_name}}": entityAccountName,
      "{{user_name}}": firstName,
      "{{user_surname}}": lastName,
      "{{first_name}}": entityAccountName || firstName,
      "{{last_name}}": "",
      "{{tenant_name}}": tenantName,
      "{{email}}": recipientEmail,
      "{{transaction_date}}": txn.transaction_date || "",
      "{{account_number}}": txn.account_number || "",
      "{{entity_account_name}}": entityAccountName,
      "{{transaction_type}}": translatedTxnType,
      "{{reference}}": txn.reference || "",
      "{{email_signature}}": resolvedSignature,
    };
    for (const [key, val] of Object.entries(replacements)) {
      subject = subject.replaceAll(key, val);
      body = body.replaceAll(key, val);
    }

    if (resolvedSignature && !body.includes(resolvedSignature)) {
      body = body + resolvedSignature;
    }

    // Multi-port fallback strategy (matches test-smtp)
    const portStrategies = [
      { port: 465, secure: true,  ignoreTLS: false },
      { port: 587, secure: false, ignoreTLS: false },
      { port: 587, secure: false, ignoreTLS: true  },
      { port: 25,  secure: false, ignoreTLS: true  },
    ];

    let transporter: any = null;
    for (const strategy of portStrategies) {
      try {
        const t = nodemailer.createTransport({
          host: smtpHost,
          port: strategy.port,
          secure: strategy.secure,
          ignoreTLS: strategy.ignoreTLS,
          tls: { rejectUnauthorized: false },
          auth: smtpUsername ? { user: smtpUsername, pass: smtpPassword || "" } : undefined,
        });
        await t.verify();
        transporter = t;
        console.log(`[send-transaction-email] Connected via ${smtpHost}:${strategy.port} (secure=${strategy.secure})`);
        break;
      } catch (err: any) {
        console.log(`[send-transaction-email] Strategy ${smtpHost}:${strategy.port} failed: ${err.message}`);
        // If auth error (534/535), don't try plain strategies
        if (/534|535/.test(err.message)) break;
      }
    }

    if (!transporter) {
      console.error("[send-transaction-email] All SMTP connection strategies failed");
      return new Response(JSON.stringify({ success: false, error: "SMTP connection failed" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isSmtpUserEmail = smtpUsername?.includes("@");
    const effectiveFromEmail = isSmtpUserEmail ? smtpUsername : smtpFromEmail;
    const fromHeader = smtpFromName
      ? `"${smtpFromName}" <${effectiveFromEmail}>`
      : effectiveFromEmail;

    const logEmail = async (recipientEmail: string, recipientUserId: string | null, emailSubject: string, emailStatus: string, errorMsg: string | null, msgId: string | null) => {
      try {
        await adminClient.from("email_logs").insert({
          tenant_id,
          recipient_email: recipientEmail,
          recipient_user_id: recipientUserId,
          application_event,
          subject: emailSubject,
          status: emailStatus,
          error_message: errorMsg,
          message_id: msgId,
          metadata: { transaction_data: txn },
        });
      } catch (logErr: any) {
        console.warn(`[send-transaction-email] Failed to log email: ${logErr.message}`);
      }
    };

    // Build attachments array
    const attachments: any[] = [];
    if (statementHtml) {
      const toDate = new Date();
      const dateStr = toDate.toISOString().split("T")[0];
      attachments.push({
        filename: `Statement_${txn.account_number || "member"}_${dateStr}.html`,
        content: statementHtml,
        contentType: "text/html",
      });
    }

    // Build recipient list
    const recipientSet = new Set<string>();
    recipientSet.add(recipientEmail.toLowerCase());
    if (entityEmail && !recipientSet.has(entityEmail.toLowerCase())) {
      recipientSet.add(entityEmail.toLowerCase());
    }

    // Send to member + entity email
    let memberSent = false;
    let memberMessageId = "";
    for (const recipientAddr of recipientSet) {
      try {
        const info = await transporter.sendMail({
          from: fromHeader,
          to: recipientAddr,
          subject,
          html: body,
          attachments,
        });
        memberSent = true;
        if (recipientAddr === recipientEmail.toLowerCase()) {
          memberMessageId = info.messageId;
        }
        console.log(`[send-transaction-email] Email sent: ${info.messageId} to ${recipientAddr}`);
        await logEmail(recipientAddr, recipientAddr === recipientEmail.toLowerCase() ? user_id : null, subject, "sent", null, info.messageId);
      } catch (err: any) {
        console.error(`[send-transaction-email] Email failed to ${recipientAddr}: ${err.message}`);
        await logEmail(recipientAddr, recipientAddr === recipientEmail.toLowerCase() ? user_id : null, subject, "failed", err.message, null);
      }
    }

    // Send to admin (no statement attachment for admin)
    let adminSent = false;
    const adminEmail = adminNotifyEmail || tenantConfig.smtp_from_email;
    if (adminEmail && !recipientSet.has(adminEmail.toLowerCase())) {
      const adminSubject = `[Admin] ${subject} — ${txn.account_number || firstName}`;
      try {
        await transporter.sendMail({
          from: fromHeader,
          to: adminEmail,
          subject: adminSubject,
          html: body,
        });
        adminSent = true;
        console.log(`[send-transaction-email] Admin email sent to ${adminEmail}`);
        await logEmail(adminEmail, null, adminSubject, "sent", null, null);
      } catch (err: any) {
        console.error(`[send-transaction-email] Admin email failed: ${err.message}`);
        await logEmail(adminEmail, null, adminSubject, "failed", err.message, null);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        member_email_sent: memberSent,
        admin_email_sent: adminSent,
        statement_attached: !!statementHtml,
        message_id: memberMessageId || undefined,
        recipient: recipientEmail,
        entity_email: entityEmail || undefined,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[send-transaction-email] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
