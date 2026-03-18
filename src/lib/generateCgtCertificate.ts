/**
 * Generates a print-ready HTML CGT (Capital Gains Tax) Certificate
 * showing cost base, market value, and capital gain/loss per pool
 * for the South African tax year (1 Mar – 28 Feb).
 */
import { formatCurrency } from "@/lib/formatCurrency";

export interface CgtCertificateData {
  taxYearLabel: string; // e.g. "2024/2025"
  fromDate: string;
  toDate: string;
  currencySymbol: string;
  entity: any;
  entityAccounts: any[];
  memberAddress: any;
  tenantConfig: any;
  legalEntity: any;
  legalAddress: any;
  /** Unit transactions within the tax year */
  unitTransactions: any[];
  /** Units held at start of period (cost base) */
  openingUnits: any[];
  /** Units held at end of period (market value) */
  closingUnits: any[];
  /** Pool prices at start of period */
  poolPricesStart: Record<string, any>;
  /** Pool prices at end of period */
  poolPricesEnd: Record<string, any>;
}

const fmtDate = (d: string) => {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
};

const fmtNum = (n: number, sym: string) => formatCurrency(n, sym);

export function generateCgtCertificate(data: CgtCertificateData): string {
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

  // Tenant details
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

  // Build pool summary: cost base (opening) vs market value (closing)
  const poolSummary: Record<string, {
    name: string;
    openUnits: number; closeUnits: number;
    openPrice: number; closePrice: number;
    depositsUnits: number; depositsValue: number;
    withdrawalsUnits: number; withdrawalsValue: number;
  }> = {};

  for (const row of data.openingUnits) {
    const poolId = row.pool_id;
    const priceInfo = data.poolPricesStart[poolId];
    if (!poolSummary[poolId]) {
      poolSummary[poolId] = {
        name: priceInfo?.pools?.name || "Unknown",
        openUnits: 0, closeUnits: 0,
        openPrice: Number(priceInfo?.unit_price_sell || 0), closePrice: 0,
        depositsUnits: 0, depositsValue: 0,
        withdrawalsUnits: 0, withdrawalsValue: 0,
      };
    }
    poolSummary[poolId].openUnits += Number(row.total_units);
  }

  for (const row of data.closingUnits) {
    const poolId = row.pool_id;
    const priceInfo = data.poolPricesEnd[poolId];
    if (!poolSummary[poolId]) {
      poolSummary[poolId] = {
        name: priceInfo?.pools?.name || "Unknown",
        openUnits: 0, closeUnits: 0,
        openPrice: 0, closePrice: Number(priceInfo?.unit_price_sell || 0),
        depositsUnits: 0, depositsValue: 0,
        withdrawalsUnits: 0, withdrawalsValue: 0,
      };
    }
    poolSummary[poolId].closeUnits += Number(row.total_units);
    poolSummary[poolId].closePrice = Number(priceInfo?.unit_price_sell || 0);
  }

  // Aggregate deposits and withdrawals from unit transactions
  for (const tx of data.unitTransactions) {
    const poolId = tx.pool_id;
    if (!poolSummary[poolId]) continue;
    const debit = Number(tx.debit || 0);
    const credit = Number(tx.credit || 0);
    const value = Math.abs(Number(tx.value || 0));
    if (debit > 0) {
      poolSummary[poolId].depositsUnits += debit;
      poolSummary[poolId].depositsValue += value;
    }
    if (credit > 0) {
      poolSummary[poolId].withdrawalsUnits += credit;
      poolSummary[poolId].withdrawalsValue += value;
    }
  }

  // Filter to pools with any activity
  const activePools = Object.entries(poolSummary).filter(([, p]) => {
    const openVal = Math.abs(p.openUnits * p.openPrice);
    const closeVal = Math.abs(p.closeUnits * p.closePrice);
    return openVal > 0.001 || closeVal > 0.001 || p.depositsUnits > 0 || p.withdrawalsUnits > 0;
  });

  // Calculate totals
  let totalCostBase = 0;
  let totalMarketValue = 0;

  const poolRows = activePools.map(([, p]) => {
    const costBase = p.openUnits * p.openPrice + p.depositsValue;
    const marketValue = p.closeUnits * p.closePrice;
    const gain = marketValue - costBase;
    totalCostBase += costBase;
    totalMarketValue += marketValue;

    return `<tr>
      <td>${p.name}</td>
      <td class="num">${p.openUnits.toFixed(4)}</td>
      <td class="num">${fmtNum(p.openPrice, sym)}</td>
      <td class="num">${fmtNum(p.openUnits * p.openPrice, sym)}</td>
      <td class="num">${p.depositsUnits > 0 ? p.depositsUnits.toFixed(4) : "—"}</td>
      <td class="num">${p.depositsValue > 0 ? fmtNum(p.depositsValue, sym) : "—"}</td>
      <td class="num">${p.withdrawalsUnits > 0 ? p.withdrawalsUnits.toFixed(4) : "—"}</td>
      <td class="num">${p.withdrawalsValue > 0 ? fmtNum(p.withdrawalsValue, sym) : "—"}</td>
      <td class="num">${p.closeUnits.toFixed(4)}</td>
      <td class="num">${fmtNum(p.closePrice, sym)}</td>
      <td class="num">${fmtNum(marketValue, sym)}</td>
      <td class="num ${gain < 0 ? 'neg' : gain > 0 ? 'pos' : ''}">${fmtNum(gain, sym)}</td>
    </tr>`;
  }).join("");

  const totalGain = totalMarketValue - totalCostBase;
  const dateGenerated = new Date().toLocaleDateString("en-ZA", { day: "2-digit", month: "long", year: "numeric" });

  return `<!DOCTYPE html>
<html><head>
<title>CGT Certificate - ${memberName} - ${data.taxYearLabel}</title>
<style>
  @page { margin: 15mm; size: A4 landscape; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 9pt; line-height: 1.4; color: #1a1a1a; max-width: 1100px; margin: 0 auto; padding: 16px; }
  .print-btn { position: fixed; top: 10px; right: 10px; background: #2563eb; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 13px; z-index: 1000; }
  .print-btn:hover { background: #1d4ed8; }
  @media print { .print-btn { display: none; } }

  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1e3a5f; padding-bottom: 12px; margin-bottom: 16px; }
  .header-left { display: flex; align-items: center; gap: 12px; }
  .header-left img { max-height: 60px; max-width: 120px; object-fit: contain; }
  .coop-name { font-size: 14pt; font-weight: bold; color: #1e3a5f; }
  .coop-details { font-size: 7.5pt; color: #666; line-height: 1.5; }
  .header-right { text-align: right; font-size: 7.5pt; color: #666; line-height: 1.5; }

  .doc-title { text-align: center; font-size: 16pt; font-weight: bold; color: #1e3a5f; margin: 8px 0 4px; }
  .doc-subtitle { text-align: center; font-size: 10pt; color: #666; margin-bottom: 16px; }

  .member-info { display: flex; justify-content: space-between; background: #f5f7fa; border: 1px solid #e0e4ea; border-radius: 6px; padding: 10px 14px; margin-bottom: 16px; }
  .member-info .col { }
  .member-info .label { font-size: 7pt; text-transform: uppercase; letter-spacing: 0.5px; color: #888; }
  .member-info .val { font-weight: 600; font-size: 9pt; }

  .section { margin-top: 18px; }
  .section-title { font-size: 11pt; font-weight: bold; color: #1e3a5f; border-bottom: 1px solid #c8d0da; padding-bottom: 4px; margin-bottom: 8px; }

  table { width: 100%; border-collapse: collapse; font-size: 8pt; margin-bottom: 4px; }
  thead { background: #1e3a5f; color: white; }
  th { padding: 5px 6px; text-align: left; font-weight: 600; font-size: 7pt; text-transform: uppercase; letter-spacing: 0.3px; }
  th.num { text-align: right; }
  td { padding: 4px 6px; border-bottom: 1px solid #eee; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  td.neg { color: #dc2626; font-weight: 600; }
  td.pos { color: #16a34a; font-weight: 600; }
  tr.total { background: #f0f2f5; font-weight: bold; }
  tr.total td { border-top: 2px solid #1e3a5f; border-bottom: none; }

  .summary-cards { display: flex; gap: 12px; margin: 16px 0; }
  .scard { flex: 1; background: #f5f7fa; border: 1px solid #e0e4ea; border-radius: 6px; padding: 10px 14px; text-align: center; }
  .scard .lbl { font-size: 7pt; text-transform: uppercase; color: #888; }
  .scard .amt { font-size: 16pt; font-weight: bold; color: #1e3a5f; }
  .scard .amt.neg { color: #dc2626; }
  .scard .amt.pos { color: #16a34a; }

  .disclaimer { margin-top: 20px; padding: 10px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; font-size: 7.5pt; color: #92400e; line-height: 1.5; }
  .footer { margin-top: 20px; border-top: 1px solid #c8d0da; padding-top: 8px; font-size: 7pt; color: #888; text-align: center; line-height: 1.6; }
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

<div class="doc-title">Capital Gains Tax Certificate</div>
<div class="doc-subtitle">Tax Year: ${data.taxYearLabel} (${fmtDate(data.fromDate)} — ${fmtDate(data.toDate)})</div>

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

<!-- SUMMARY CARDS -->
<div class="summary-cards">
  <div class="scard">
    <div class="lbl">Total Cost Base</div>
    <div class="amt">${fmtNum(totalCostBase, sym)}</div>
  </div>
  <div class="scard">
    <div class="lbl">Market Value at ${fmtDate(data.toDate)}</div>
    <div class="amt">${fmtNum(totalMarketValue, sym)}</div>
  </div>
  <div class="scard">
    <div class="lbl">Unrealised Capital ${totalGain >= 0 ? "Gain" : "Loss"}</div>
    <div class="amt ${totalGain < 0 ? 'neg' : 'pos'}">${totalGain >= 0 ? '+' : ''}${fmtNum(totalGain, sym)}</div>
  </div>
</div>

<!-- POOL DETAIL TABLE -->
<div class="section">
  <div class="section-title">Pool Holdings Detail</div>
  ${activePools.length > 0 ? `
  <table>
    <thead>
      <tr>
        <th>Pool</th>
        <th class="num">Open Units</th>
        <th class="num">Open Price</th>
        <th class="num">Open Value</th>
        <th class="num">Bought Units</th>
        <th class="num">Bought Value</th>
        <th class="num">Sold Units</th>
        <th class="num">Sold Value</th>
        <th class="num">Close Units</th>
        <th class="num">Close Price</th>
        <th class="num">Market Value</th>
        <th class="num">Gain / Loss</th>
      </tr>
    </thead>
    <tbody>
      ${poolRows}
      <tr class="total">
        <td colspan="3">Total</td>
        <td class="num">${fmtNum(activePools.reduce((s, [, p]) => s + p.openUnits * p.openPrice, 0), sym)}</td>
        <td></td>
        <td class="num">${fmtNum(activePools.reduce((s, [, p]) => s + p.depositsValue, 0), sym)}</td>
        <td></td>
        <td class="num">${fmtNum(activePools.reduce((s, [, p]) => s + p.withdrawalsValue, 0), sym)}</td>
        <td></td>
        <td></td>
        <td class="num">${fmtNum(totalMarketValue, sym)}</td>
        <td class="num ${totalGain < 0 ? 'neg' : 'pos'}">${fmtNum(totalGain, sym)}</td>
      </tr>
    </tbody>
  </table>` : `<p style="text-align:center;color:#888;font-style:italic;padding:12px;">No pool holdings found for this tax year.</p>`}
</div>

<!-- DISCLAIMER -->
<div class="disclaimer">
  <strong>Important:</strong> This certificate is provided for informational purposes only and should not be considered as tax advice.
  Capital gains/losses shown are based on the difference between cost base (opening value plus additional investments) and
  closing market value as at the end of the tax year. Actual CGT liability depends on your personal tax circumstances,
  including the annual exclusion, inclusion rates, and whether gains are realised or unrealised. Please consult your tax
  advisor or SARS for definitive guidance.
</div>

<!-- FOOTER -->
<div class="footer">
  ${coopName}${coopRegNo ? ` | Reg No: ${coopRegNo}` : ""}${vatNumber ? ` | VAT: ${vatNumber}` : ""}
  ${directors ? `<br/>Directors: ${directors}` : ""}
  <br/>Certificate generated on ${dateGenerated}
</div>

</body></html>`;
}
