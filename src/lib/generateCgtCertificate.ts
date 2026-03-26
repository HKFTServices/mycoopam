/**
 * Generates a print-ready HTML CGT (Capital Gains Tax) Certificate – IT3(c)
 * Based on SARS source codes 6506 (Profit) and 6507 (Loss).
 *
 * Calculation logic:
 *   1. Total Cost Base = sum of (units × unit_price) for ALL unit purchases
 *      up to start of the tax year → gives total units held & total cost.
 *   2. Cost Per Unit (CPU) = Total Cost Base / Total Units Held at start.
 *   3. Redemptions during the year: units sold (credits) and their actual
 *      proceeds (value field on each withdrawal transaction).
 *   4. Base Cost of redeemed units = CPU × redeemed units.
 *   5. Net Gain/Loss = Total Proceeds − Base Cost of redeemed units.
 *
 * South African tax year: 1 March – 28/29 February.
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
  /** Unit transactions (redemptions/withdrawals) within the tax year */
  unitTransactions: any[];
  /** All unit purchase transactions from inception up to start of tax year */
  allPurchasesBeforeStart: any[];
}

/* ────────────── helpers ────────────── */

const fmtDate = (d: string) => {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
};

const fmtNum = (n: number, sym: string) => formatCurrency(n, sym);

/* ────────────── main ────────────── */

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

  // Tenant / co-op details
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

  /* ─── Step 1: Build cost base per pool from ALL purchases up to start ─── */
  const poolCostBase: Record<string, { name: string; totalUnits: number; totalCost: number }> = {};

  for (const tx of data.allPurchasesBeforeStart) {
    const poolId = tx.pool_id;
    const units = Number(tx.debit || 0); // purchases = debit
    const value = Math.abs(Number(tx.value || 0));
    if (units <= 0) continue;
    if (!poolCostBase[poolId]) {
      poolCostBase[poolId] = { name: tx.pools?.name || "Unknown", totalUnits: 0, totalCost: 0 };
    }
    poolCostBase[poolId].totalUnits += units;
    poolCostBase[poolId].totalCost += value;
  }

  /* ─── Step 2: Aggregate redemptions per pool during the tax year ─── */
  const poolRedemptions: Record<string, { name: string; redeemedUnits: number; totalProceeds: number }> = {};

  for (const tx of data.unitTransactions) {
    const poolId = tx.pool_id;
    const units = Number(tx.credit || 0); // redemptions = credit
    const value = Math.abs(Number(tx.value || 0));
    if (units <= 0) continue;
    if (!poolRedemptions[poolId]) {
      poolRedemptions[poolId] = { name: tx.pools?.name || "Unknown", redeemedUnits: 0, totalProceeds: 0 };
    }
    poolRedemptions[poolId].redeemedUnits += units;
    poolRedemptions[poolId].totalProceeds += value;
  }

  /* ─── Step 3: Calculate gain/loss per pool ─── */
  interface PoolResult {
    name: string;
    redeemedUnits: number;
    baseCost: number;
    proceeds: number;
    gainLoss: number;
    sourceCode: string;
  }

  const results: PoolResult[] = [];
  let totalBaseCost = 0;
  let totalProceeds = 0;

  for (const [poolId, redemption] of Object.entries(poolRedemptions)) {
    const costInfo = poolCostBase[poolId];
    const cpu = costInfo && costInfo.totalUnits > 0
      ? costInfo.totalCost / costInfo.totalUnits
      : 0;
    const baseCost = cpu * redemption.redeemedUnits;
    const gainLoss = redemption.totalProceeds - baseCost;

    totalBaseCost += baseCost;
    totalProceeds += redemption.totalProceeds;

    results.push({
      name: redemption.name,
      redeemedUnits: redemption.redeemedUnits,
      baseCost,
      proceeds: redemption.totalProceeds,
      gainLoss,
      sourceCode: gainLoss >= 0 ? "6506" : "6507",
    });
  }

  const totalGainLoss = totalProceeds - totalBaseCost;

  /* ─── Build HTML rows ─── */
  const poolRows = results.map((r) => `
    <tr>
      <td class="code">${r.sourceCode}</td>
      <td>${r.name}</td>
      <td class="num">${r.redeemedUnits.toFixed(3)}</td>
      <td class="num">${fmtNum(r.baseCost, sym)}</td>
      <td class="num">${fmtNum(r.proceeds, sym)}</td>
      <td class="num ${r.gainLoss < 0 ? 'neg' : r.gainLoss > 0 ? 'pos' : ''}">${fmtNum(r.gainLoss, sym)}</td>
    </tr>`).join("");

  const dateGenerated = new Date().toLocaleDateString("en-ZA", { day: "2-digit", month: "long", year: "numeric" });

  /* ─── Full HTML document ─── */
  return `<!DOCTYPE html>
<html><head>
<title>IT3(c) CGT Certificate - ${memberName} - ${data.taxYearLabel}</title>
<style>
  @page { margin: 15mm; size: A4; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; line-height: 1.5; color: #1a1a1a; max-width: 800px; margin: 0 auto; padding: 20px; }
  .print-btn { position: fixed; top: 10px; right: 10px; background: #2563eb; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 13px; z-index: 1000; display: flex; align-items: center; gap: 8px; }
  .print-btn:hover { background: #1d4ed8; }
  .print-btn svg { width: 16px; height: 16px; }
  @media print { .print-btn { display: none; } }

  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1e3a5f; padding-bottom: 14px; margin-bottom: 20px; }
  .header-left { display: flex; align-items: center; gap: 14px; }
  .header-left img { max-height: 70px; max-width: 140px; object-fit: contain; }
  .coop-name { font-size: 15pt; font-weight: bold; color: #1e3a5f; }
  .coop-details { font-size: 8pt; color: #555; line-height: 1.6; }
  .header-right { text-align: right; font-size: 8pt; color: #555; line-height: 1.6; }

  .doc-title { text-align: center; font-size: 18pt; font-weight: bold; color: #1e3a5f; margin: 12px 0 2px; }
  .doc-subtitle { text-align: center; font-size: 11pt; color: #555; margin-bottom: 4px; }
  .doc-subtitle2 { text-align: center; font-size: 10pt; color: #555; margin-bottom: 20px; }

  .member-info { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; background: #f5f7fa; border: 1px solid #e0e4ea; border-radius: 6px; padding: 12px 16px; margin-bottom: 20px; }
  .member-info .item { display: flex; gap: 6px; }
  .member-info .label { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.4px; color: #888; min-width: 120px; }
  .member-info .val { font-weight: 600; font-size: 9.5pt; }

  .section { margin-top: 24px; }
  .section-title { font-size: 12pt; font-weight: bold; color: #1e3a5f; border-bottom: 1px solid #c8d0da; padding-bottom: 4px; margin-bottom: 10px; }

  table { width: 100%; border-collapse: collapse; font-size: 9pt; margin-bottom: 6px; }
  thead { background: #1e3a5f; color: white; }
  th { padding: 6px 8px; text-align: left; font-weight: 600; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.3px; }
  th.num { text-align: right; }
  td { padding: 5px 8px; border-bottom: 1px solid #eee; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  td.code { font-weight: 600; color: #1e3a5f; width: 70px; }
  td.neg { color: #dc2626; font-weight: 600; }
  td.pos { color: #16a34a; font-weight: 600; }
  tr.total { background: #f0f2f5; font-weight: bold; }
  tr.total td { border-top: 2px solid #1e3a5f; border-bottom: none; }

  .summary-cards { display: flex; gap: 14px; margin: 20px 0; }
  .scard { flex: 1; background: #f5f7fa; border: 1px solid #e0e4ea; border-radius: 6px; padding: 12px 16px; text-align: center; }
  .scard .lbl { font-size: 7.5pt; text-transform: uppercase; color: #888; }
  .scard .amt { font-size: 18pt; font-weight: bold; color: #1e3a5f; }
  .scard .amt.neg { color: #dc2626; }
  .scard .amt.pos { color: #16a34a; }

  .explanations { margin-top: 24px; }
  .explanations h3 { font-size: 10pt; font-weight: bold; color: #1e3a5f; margin-bottom: 6px; }
  .explanations ol, .explanations ul { margin: 0 0 10px 20px; font-size: 8.5pt; color: #444; line-height: 1.7; }
  .source-codes { list-style: none; padding: 0; margin: 0 0 0 4px; }
  .source-codes li { padding: 2px 0; }
  .source-codes li strong { color: #1e3a5f; }

  .disclaimer { margin-top: 20px; padding: 10px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; font-size: 7.5pt; color: #92400e; line-height: 1.5; }
  .footer { margin-top: 24px; border-top: 1px solid #c8d0da; padding-top: 8px; font-size: 7pt; color: #888; text-align: center; line-height: 1.6; }
</style>
</head>
<body>
<button class="print-btn" onclick="window.print()">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <polyline points="6 9 6 2 18 2 18 9"></polyline>
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
    <rect x="6" y="14" width="12" height="8"></rect>
  </svg>
  Print / Save as PDF
</button>

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

<!-- TITLE -->
<div class="doc-title">Capital Gains Tax Certificate IT3(c)</div>
<div class="doc-subtitle">Kapitaalwinsbelastingsertifikaat</div>
<div class="doc-subtitle2">For the year ended ${fmtDate(data.toDate)} / Vir die jaar geëindig ${fmtDate(data.toDate)}</div>

<!-- MEMBER INFO -->
<div class="member-info">
  <div class="item"><span class="label">Member / Lid</span><span class="val">${memberName}</span></div>
  <div class="item"><span class="label">ID / Reg No</span><span class="val">${memberId}</span></div>
  <div class="item"><span class="label">Account No / Rekeningnr</span><span class="val">${accountNumber}</span></div>
  <div class="item"><span class="label">Category</span><span class="val">${category || "—"}</span></div>
  <div class="item" style="grid-column: span 2"><span class="label">Address / Adres</span><span class="val" style="font-size:8.5pt">${memberAddr || "—"}</span></div>
</div>

<!-- SUMMARY CARDS -->
<div class="summary-cards">
  <div class="scard">
    <div class="lbl">Total Base Cost / Totale Basiskoste</div>
    <div class="amt">${fmtNum(totalBaseCost, sym)}</div>
  </div>
  <div class="scard">
    <div class="lbl">Total Proceeds / Totale Opbrengs</div>
    <div class="amt">${fmtNum(totalProceeds, sym)}</div>
  </div>
  <div class="scard">
    <div class="lbl">Net ${totalGainLoss >= 0 ? "Gain / Wins" : "Loss / Verlies"}</div>
    <div class="amt ${totalGainLoss < 0 ? 'neg' : 'pos'}">${totalGainLoss >= 0 ? '+' : ''}${fmtNum(totalGainLoss, sym)}</div>
  </div>
</div>

<!-- REALISED GAINS/LOSSES TABLE -->
<div class="section">
  <div class="section-title">Realised Gains / Losses — Gerealiseerde Winste / Verliese</div>
  ${results.length > 0 ? `
  <table>
    <thead>
      <tr>
        <th>Source Code</th>
        <th>Asset Description / Beskrywing</th>
        <th class="num">Units / Eenhede</th>
        <th class="num">Base Cost / Basiskoste</th>
        <th class="num">Proceeds / Opbrengs</th>
        <th class="num">Net Gain/Loss</th>
      </tr>
    </thead>
    <tbody>
      ${poolRows}
      <tr class="total">
        <td></td>
        <td>Total / Totaal</td>
        <td class="num">${results.reduce((s, r) => s + r.redeemedUnits, 0).toFixed(3)}</td>
        <td class="num">${fmtNum(totalBaseCost, sym)}</td>
        <td class="num">${fmtNum(totalProceeds, sym)}</td>
        <td class="num ${totalGainLoss < 0 ? 'neg' : 'pos'}">${fmtNum(totalGainLoss, sym)}</td>
      </tr>
    </tbody>
  </table>` : `<p style="text-align:center;color:#888;font-style:italic;padding:16px;">No redemptions were made during this tax year.<br/>Geen herwinnings is gedurende hierdie belastingjaar gemaak nie.</p>`}
</div>

<!-- EXPLANATIONS -->
<div class="explanations">
  <h3>Explanations / Verduidelikings</h3>
  <ol>
    <li>Base cost is the weighted average cost price of units held at the start of the tax year, applied to the units redeemed.<br/>
        <em>Basiskoste is die geweegde gemiddelde kosprys van eenhede gehou aan die begin van die belastingjaar, toegepas op die eenhede wat herwin is.</em></li>
    <li>Proceeds is the actual amount received for the units redeemed during the tax year.<br/>
        <em>Opbrengs is die werklike bedrag ontvang vir die eenhede wat gedurende die belastingjaar herwin is.</em></li>
    <li>Realised gains/losses refer to gains and losses on transactions that have already taken place.<br/>
        <em>Gerealiseerde winste/verliese verwys na winste en verliese op transaksies wat reeds plaasgevind het.</em></li>
  </ol>
  <h3>Source Codes / Bronkodes</h3>
  <ul class="source-codes">
    <li><strong>6506</strong> — Capital Gain / Kapitaalwins</li>
    <li><strong>6507</strong> — Capital Loss / Kapitaalverlies</li>
  </ul>
</div>

<!-- DISCLAIMER -->
<div class="disclaimer">
  <strong>Important / Belangrik:</strong> This certificate is provided for informational purposes only and should not be considered as tax advice.
  Actual CGT liability depends on your personal tax circumstances, including the annual exclusion (R40,000), inclusion rates, and marginal tax rate.
  Please consult your tax advisor or SARS for definitive guidance.
</div>

<!-- FOOTER -->
<div class="footer">
  ${coopName}${coopRegNo ? ` | Reg No: ${coopRegNo}` : ""}${vatNumber ? ` | VAT: ${vatNumber}` : ""}
  ${directors ? `<br/>Directors: ${directors}` : ""}
  <br/>Certificate generated on ${dateGenerated}
</div>

</body></html>`;
}
