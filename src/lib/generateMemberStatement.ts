/**
 * Generates a print-ready HTML member statement with branded header,
 * summary, cash flows, stock flows, unit movements, and loans sections.
 */
import { formatCurrency } from "@/lib/formatCurrency";

export interface StatementData {
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
  loanTransactions?: any[];
  openingUnits: any[];
  closingUnits: any[];
  poolPricesStart: Record<string, any>;
  poolPricesEnd: Record<string, any>;
}

/** Clean up raw legacy entry type labels like "Entry 1963" into readable descriptions */
const cleanEntryType = (entryType: string, debit: number, credit: number): string => {
  if (!entryType) return "Transaction";
  // If it's a proper modern entry type, format it nicely
  const entryTypeLabels: Record<string, string> = {
    pool_allocation: "Deposit",
    pool_redemption: "Withdrawal",
    bank_deposit: "Bank Deposit",
    bank_withdrawal: "Bank Withdrawal",
    fee: "Fee",
    stock_deposit: "Stock Deposit",
    stock_withdrawal: "Stock Withdrawal",
    stock_control: "Stock Control",
    journal: "Journal",
    bank: "Bank",
    bank_contra: "Bank Contra",
  };
  if (entryTypeLabels[entryType]) return entryTypeLabels[entryType];
  // Legacy "Entry XXXX" pattern — derive label from debit/credit direction
  if (/^Entry\s+\d+$/i.test(entryType)) {
    if (debit > 0 && credit === 0) return "Deposit";
    if (credit > 0 && debit === 0) return "Withdrawal";
    return "Transaction";
  }
  // Fallback: title-case the entry_type
  return entryType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
};

const fmtDate = (d: string) => {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
};

const fmtNum = (n: number, sym: string) => formatCurrency(n, sym);

export function generateMemberStatement(data: StatementData): string {
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

  // Tenant / Co-op details
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

  // Calculate summary - opening and closing values per pool
  // Include display type from pool settings
  const poolSummary: Record<string, { name: string; openUnits: number; closeUnits: number; openPrice: number; closePrice: number; displayType: string; statementDesc: string }> = {};

  for (const row of data.openingUnits) {
    const poolId = row.pool_id;
    const priceInfo = data.poolPricesStart[poolId];
    const displayType = priceInfo?.pools?.pool_statement_display_type ?? "display_in_summary";
    if (displayType === "do_not_display") continue;
    if (!poolSummary[poolId]) {
      poolSummary[poolId] = { name: priceInfo?.pools?.name || "Unknown", openUnits: 0, closeUnits: 0, openPrice: Number(priceInfo?.unit_price_sell || 0), closePrice: 0, displayType, statementDesc: priceInfo?.pools?.pool_statement_description || "" };
    }
    poolSummary[poolId].openUnits += Number(row.total_units);
  }

  for (const row of data.closingUnits) {
    const poolId = row.pool_id;
    const priceInfo = data.poolPricesEnd[poolId];
    const displayType = priceInfo?.pools?.pool_statement_display_type ?? "display_in_summary";
    if (displayType === "do_not_display") continue;
    if (!poolSummary[poolId]) {
      poolSummary[poolId] = { name: priceInfo?.pools?.name || "Unknown", openUnits: 0, closeUnits: 0, openPrice: 0, closePrice: Number(priceInfo?.unit_price_sell || 0), displayType, statementDesc: priceInfo?.pools?.pool_statement_description || "" };
    }
    poolSummary[poolId].closeUnits += Number(row.total_units);
    poolSummary[poolId].closePrice = Number(priceInfo?.unit_price_sell || 0);
    if (!poolSummary[poolId].statementDesc) {
      poolSummary[poolId].statementDesc = priceInfo?.pools?.pool_statement_description || "";
    }
  }

  // Filter out pools with no values
  const activePools = Object.entries(poolSummary).filter(([, p]) => {
    const openVal = Math.abs(p.openUnits * p.openPrice);
    const closeVal = Math.abs(p.closeUnits * p.closePrice);
    return openVal > 0.001 || closeVal > 0.001;
  });

  // Split by display type
  const summaryPools = activePools.filter(([, p]) => p.displayType === "display_in_summary");
  const belowSummaryPools = activePools.filter(([, p]) => p.displayType === "display_below_summary");

  // Totals based on summary pools only
  const openTotal = summaryPools.reduce((s, [, p]) => s + p.openUnits * p.openPrice, 0);
  const closeTotal = summaryPools.reduce((s, [, p]) => s + p.closeUnits * p.closePrice, 0);
  const changeTotal = closeTotal - openTotal;

  // Build sections HTML - summary table only shows display_in_summary pools
  const summaryRows = summaryPools.map(([, p]) => {
    const openVal = p.openUnits * p.openPrice;
    const closeVal = p.closeUnits * p.closePrice;
    const change = closeVal - openVal;
    return `<tr>
      <td>${p.name}</td>
      <td class="num">${p.openUnits.toFixed(4)}</td>
      <td class="num">${fmtNum(p.openPrice, sym)}</td>
      <td class="num">${fmtNum(openVal, sym)}</td>
      <td class="num">${p.closeUnits.toFixed(4)}</td>
      <td class="num">${fmtNum(p.closePrice, sym)}</td>
      <td class="num">${fmtNum(closeVal, sym)}</td>
      <td class="num ${change < 0 ? 'neg' : ''}">${fmtNum(change, sym)}</td>
    </tr>`;
  }).join("");

  // Below-summary notes
  const belowSummaryHtml = belowSummaryPools.length > 0
    ? `<div style="margin-top:8px;font-size:8pt;color:#444;line-height:1.7;">
        ${belowSummaryPools.map(([, p]) => {
          const closeVal = p.closeUnits * p.closePrice;
          const label = p.statementDesc || p.name;
          return `<div><strong>${label}:</strong> ${fmtNum(closeVal, sym)}</div>`;
        }).join("")}
      </div>`
    : "";

  // Unit movements section
  const unitRows = data.unitTransactions.map((tx: any) => {
    const debit = Number(tx.debit || 0);
    const credit = Number(tx.credit || 0);
    const rawValue = Number(tx.value || 0);
    // Redemptions (credit/out) show value as negative in red
    const isRedemption = credit > 0 && debit === 0;
    const displayValue = isRedemption && rawValue > 0 ? -rawValue : rawValue;
    const valueStyle = displayValue < 0 ? ' style="color:red"' : '';
    return `<tr>
      <td>${fmtDate(tx.transaction_date)}</td>
      <td>${tx.transaction_type || ""}</td>
      <td>${tx.pools?.name || ""}</td>
      <td class="num">${debit > 0 ? debit.toFixed(4) : ""}</td>
      <td class="num">${credit > 0 ? credit.toFixed(4) : ""}</td>
      <td class="num">${fmtNum(Number(tx.unit_price || 0), sym)}</td>
      <td class="num"${valueStyle}>${fmtNum(displayValue, sym)}</td>
      <td>${tx.notes || ""}</td>
    </tr>`;
  }).join("");

  // Cash flow section (already normalized with pool_name field from dialog)
  const cashRows = data.cashflowTransactions.map((tx: any) => {
    const debit = Number(tx.debit || 0);
    const credit = Number(tx.credit || 0);
    const rawLabel = tx.description || tx.entry_type || "";
    const typeLabel = /^Entry\s+\d+$/i.test(rawLabel) ? cleanEntryType(rawLabel, debit, credit) : (rawLabel ? cleanEntryType(rawLabel, debit, credit) : "Transaction");
    return `<tr>
      <td>${fmtDate(tx.transaction_date)}</td>
      <td>${typeLabel}</td>
      <td>${tx.pool_name || ""}</td>
      <td class="num">${debit > 0 ? fmtNum(debit, sym) : ""}</td>
      <td class="num">${credit > 0 ? fmtNum(credit, sym) : ""}</td>
    </tr>`;
  }).join("");

  const cashDebitTotal = data.cashflowTransactions.reduce((s: number, tx: any) => s + Number(tx.debit || 0), 0);
  const cashCreditTotal = data.cashflowTransactions.reduce((s: number, tx: any) => s + Number(tx.credit || 0), 0);

  // Stock flow section
  const stockRows = data.stockTransactions.map((tx: any) => {
    const debit = Number(tx.debit || 0);
    const credit = Number(tx.credit || 0);
    return `<tr>
      <td>${fmtDate(tx.transaction_date)}</td>
      <td>${Number(tx.debit || 0) > 0 ? "Stock Deposit" : Number(tx.credit || 0) > 0 ? "Stock Withdrawal" : (tx.stock_transaction_type || "")}</td>
      <td>${tx.items?.description || ""}</td>
      <td>${tx.pools?.name || ""}</td>
      <td class="num">${debit > 0 ? debit.toFixed(4) : ""}</td>
      <td class="num">${credit > 0 ? credit.toFixed(4) : ""}</td>
      <td class="num">${fmtNum(Number(tx.total_value || 0), sym)}</td>
    </tr>`;
  }).join("");

  // Loans section - build transaction detail with opening/closing balance
  const loanTx = data.loanTransactions ?? [];
  const hasLoanData = data.loanOutstanding > 0 || data.loanPayout > 0 || loanTx.length > 0;

  // Calculate opening loan balance = total outstanding minus period movements
  // Opening balance = closing balance - (period debits - period credits)
  const periodLoanDebit = loanTx.reduce((s: number, tx: any) => s + Number(tx.debit || 0), 0);
  const periodLoanCredit = loanTx.reduce((s: number, tx: any) => s + Number(tx.credit || 0), 0);
  const loanClosingBalance = data.loanOutstanding;
  const loanOpeningBalance = loanClosingBalance - (periodLoanDebit - periodLoanCredit);

  const loanEntryTypeLabels: Record<string, string> = {
    loan_capital: "Loan Payout",
    loan_fee: "Loan Fee",
    loan_loading: "Loan Loading",
    loan_repayment: "Loan Repayment",
    loan_interest: "Loan Interest",
    loan_writeoff: "Loan Write-off",
    loan_control: "Loan Control",
  };

  let loanRunning = loanOpeningBalance;
  const loanRows = loanTx.map((tx: any) => {
    const debit = Number(tx.debit || 0);
    const credit = Number(tx.credit || 0);
    loanRunning += debit - credit;
    const label = tx.entry_type_name || loanEntryTypeLabels[tx.entry_type] || tx.entry_type?.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) || "Transaction";
    return `<tr>
      <td>${fmtDate(tx.transaction_date)}</td>
      <td>${label}</td>
      <td class="num">${debit > 0 ? fmtNum(debit, sym) : ""}</td>
      <td class="num">${credit > 0 ? fmtNum(credit, sym) : ""}</td>
      <td class="num ${loanRunning > 0 ? 'neg' : ''}">${fmtNum(loanRunning, sym)}</td>
    </tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html><head>
<title>Member Statement - ${memberName}</title>
<style>
  @page { margin: 15mm; size: A4; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 9pt; line-height: 1.4; color: #1a1a1a; max-width: 780px; margin: 0 auto; padding: 16px; }
  .print-btn { position: fixed; top: 10px; right: 10px; background: #2563eb; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 13px; z-index: 1000; }
  .print-btn:hover { background: #1d4ed8; }
  @media print { .print-btn { display: none; } }

  /* Header */
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1e3a5f; padding-bottom: 12px; margin-bottom: 16px; }
  .header-left { display: flex; align-items: center; gap: 12px; }
  .header-left img { max-height: 60px; max-width: 120px; object-fit: contain; }
  .coop-name { font-size: 14pt; font-weight: bold; color: #1e3a5f; }
  .coop-details { font-size: 7.5pt; color: #666; line-height: 1.5; }
  .header-right { text-align: right; font-size: 7.5pt; color: #666; line-height: 1.5; }

  /* Member info */
  .member-info { display: flex; justify-content: space-between; background: #f5f7fa; border: 1px solid #e0e4ea; border-radius: 6px; padding: 10px 14px; margin-bottom: 16px; }
  .member-info .col { }
  .member-info .label { font-size: 7pt; text-transform: uppercase; letter-spacing: 0.5px; color: #888; }
  .member-info .val { font-weight: 600; font-size: 9pt; }

  /* Section headings */
  .section { margin-top: 18px; }
  .section-title { font-size: 11pt; font-weight: bold; color: #1e3a5f; border-bottom: 1px solid #c8d0da; padding-bottom: 4px; margin-bottom: 8px; display: flex; align-items: baseline; justify-content: flex-start; gap: 8px; }
  .period { font-size: 9pt; color: #1e3a5f; font-weight: bold; }
  th.group-header { text-align: center; background: #2a4f7a; color: white; font-size: 7pt; letter-spacing: 0.3px; padding: 3px 4px; }

  /* Tables */
  table { width: 100%; border-collapse: collapse; font-size: 8pt; margin-bottom: 4px; }
  thead { background: #1e3a5f; color: white; }
  th { padding: 5px 6px; text-align: left; font-weight: 600; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.3px; }
  th.num { text-align: right; }
  td { padding: 4px 6px; border-bottom: 1px solid #eee; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  td.neg { color: #dc2626; }
  tr.total { background: #f0f2f5; font-weight: bold; }
  tr.total td { border-top: 2px solid #1e3a5f; border-bottom: none; }

  /* Summary cards */
  .summary-cards { display: flex; gap: 12px; margin-bottom: 6px; }
  .scard { flex: 1; background: #f5f7fa; border: 1px solid #e0e4ea; border-radius: 6px; padding: 8px 12px; text-align: center; }
  .scard .lbl { font-size: 7pt; text-transform: uppercase; color: #888; }
  .scard .amt { font-size: 14pt; font-weight: bold; color: #1e3a5f; }
  .scard .amt.neg { color: #dc2626; }
  .scard .amt.pos { color: #16a34a; }

  /* Footer */
  .footer { margin-top: 20px; border-top: 1px solid #c8d0da; padding-top: 8px; font-size: 7pt; color: #888; text-align: center; line-height: 1.6; }

  .empty-msg { padding: 12px; text-align: center; color: #888; font-style: italic; }
</style>
</head>
<body>
<button class="print-btn" onclick="window.print()">🖨️ Print / Save as PDF</button>

<!-- HEADER -->
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

<!-- MEMBER INFO -->
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

<!-- SUMMARY -->
<div class="section">
  <div class="section-title">Portfolio Summary <span class="period">${fmtDate(data.fromDate)} — ${fmtDate(data.toDate)}</span></div>
  <div class="summary-cards">
    <div class="scard">
      <div class="lbl">Opening Value</div>
      <div class="amt">${fmtNum(openTotal, sym)}</div>
    </div>
    <div class="scard">
      <div class="lbl">Closing Value</div>
      <div class="amt">${fmtNum(closeTotal, sym)}</div>
    </div>
    <div class="scard">
      <div class="lbl">Change in Value</div>
      <div class="amt ${changeTotal < 0 ? 'neg' : 'pos'}">${changeTotal >= 0 ? '+' : ''}${fmtNum(changeTotal, sym)}</div>
    </div>
    ${data.loanOutstanding > 0 ? `<div class="scard">
      <div class="lbl">O/s Loan</div>
      <div class="amt neg">${fmtNum(data.loanOutstanding, sym)}</div>
    </div>` : ""}
  </div>

  <table>
    <thead>
      <tr>
        <th rowspan="2" style="vertical-align:bottom">Pool</th>
        <th class="group-header" colspan="3">${fmtDate(data.fromDate)}</th>
        <th class="group-header" colspan="3">${fmtDate(data.toDate)}</th>
        <th rowspan="2" class="num" style="vertical-align:bottom">Change</th>
      </tr>
      <tr>
        <th class="num">Units</th>
        <th class="num">Price</th>
        <th class="num">Value</th>
        <th class="num">Units</th>
        <th class="num">Price</th>
        <th class="num">Value</th>
      </tr>
    </thead>
    <tbody>
      ${summaryRows || '<tr><td colspan="8" class="empty-msg">No pool data for this period</td></tr>'}
      ${summaryRows ? `<tr class="total">
        <td>Total</td>
        <td></td><td></td>
        <td class="num">${fmtNum(openTotal, sym)}</td>
        <td></td><td></td>
        <td class="num">${fmtNum(closeTotal, sym)}</td>
        <td class="num ${changeTotal < 0 ? 'neg' : ''}">${changeTotal >= 0 ? '+' : ''}${fmtNum(changeTotal, sym)}</td>
      </tr>` : ""}
    </tbody>
  </table>
  ${belowSummaryHtml}
</div>

<!-- UNIT MOVEMENTS -->
<div class="section">
  <div class="section-title">Unit Movements</div>
  ${data.unitTransactions.length > 0 ? `<table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Type</th>
        <th>Pool</th>
        <th class="num">In (Debit)</th>
        <th class="num">Out (Credit)</th>
        <th class="num">Unit Price</th>
        <th class="num">Value</th>
        <th>Notes</th>
      </tr>
    </thead>
    <tbody>${unitRows}</tbody>
  </table>` : '<div class="empty-msg">No unit movements in this period</div>'}
</div>

<!-- CASH FLOWS -->
<div class="section">
  <div class="section-title">Cash Flows</div>
  ${data.cashflowTransactions.length > 0 ? `<table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Type</th>
        <th>Pool</th>
        <th class="num">Debit</th>
        <th class="num">Credit</th>
      </tr>
    </thead>
    <tbody>
      ${cashRows}
      <tr class="total">
        <td colspan="3">Total</td>
        <td class="num">${fmtNum(cashDebitTotal, sym)}</td>
        <td class="num">${fmtNum(cashCreditTotal, sym)}</td>
      </tr>
    </tbody>
  </table>` : '<div class="empty-msg">No cash flows in this period</div>'}
</div>

<!-- STOCK FLOWS -->
<div class="section">
  <div class="section-title">Stock Flows</div>
  ${data.stockTransactions.length > 0 ? `<table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Type</th>
        <th>Item</th>
        <th>Pool</th>
        <th class="num">In</th>
        <th class="num">Out</th>
        <th class="num">Value</th>
      </tr>
    </thead>
    <tbody>${stockRows}</tbody>
  </table>` : '<div class="empty-msg">No stock flows in this period</div>'}
</div>

<!-- LOANS & GRANTS -->
${hasLoanData ? `<div class="section">
  <div class="section-title">Loans & Grants</div>
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Type</th>
        <th class="num">Debit</th>
        <th class="num">Credit</th>
        <th class="num">Balance</th>
      </tr>
    </thead>
    <tbody>
      <tr style="background:#f5f7fa;font-weight:600">
        <td colspan="4">Opening Balance</td>
        <td class="num ${loanOpeningBalance > 0 ? 'neg' : ''}">${fmtNum(loanOpeningBalance, sym)}</td>
      </tr>
      ${loanRows || '<tr><td colspan="5" class="empty-msg">No loan movements in this period</td></tr>'}
      <tr class="total">
        <td colspan="2">Closing Balance</td>
        <td class="num">${periodLoanDebit > 0 ? fmtNum(periodLoanDebit, sym) : ""}</td>
        <td class="num">${periodLoanCredit > 0 ? fmtNum(periodLoanCredit, sym) : ""}</td>
        <td class="num ${loanClosingBalance > 0 ? 'neg' : ''}">${fmtNum(loanClosingBalance, sym)}</td>
      </tr>
    </tbody>
  </table>
</div>` : ""}

<!-- FOOTER -->
<div class="footer">
  ${coopName}${coopRegNo ? ` | Reg No: ${coopRegNo}` : ""}${vatNumber ? ` | VAT: ${vatNumber}` : ""}<br/>
  ${coopAddr ? `${coopAddr}<br/>` : ""}
  ${directors ? `Directors: ${directors}<br/>` : ""}
  Statement generated on ${new Date().toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}
</div>

</body></html>`;
}
