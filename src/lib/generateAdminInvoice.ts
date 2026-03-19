/**
 * Generates a print-ready HTML administrator invoice.
 */
import { formatCurrency } from "@/lib/formatCurrency";

export interface InvoiceLineItem {
  feeTypeName: string;
  poolName: string;
  basis: string;
  poolValue: number;
  amount: number;
}

export interface TxDetailItem {
  date: string;
  type: string;
  member: string;
  amount: number;
  adminPct: number;
  adminFee: number;
}

export interface AdminInvoiceData {
  invoiceDate: string;
  runDate: string;
  tenantName: string;
  legalEntityName: string | null;
  logoUrl: string | null;
  adminFeesLines: InvoiceLineItem[];
  vaultFeesLines: InvoiceLineItem[];
  txDetailLines: TxDetailItem[];
  totalAdminFees: number;
  totalVaultFees: number;
  totalTransactionalFees: number;
  grandTotal: number;
}

export function generateAdminInvoiceHtml(data: AdminInvoiceData): string {
  const fmt = (v: number) => formatCurrency(v);

  const adminFeesRows = data.adminFeesLines.map(l => `
    <tr>
      <td>${l.feeTypeName}</td>
      <td>${l.poolName}</td>
      <td>${l.basis}</td>
      <td class="right">${l.poolValue > 0 ? fmt(l.poolValue) : "—"}</td>
      <td class="right bold">${fmt(l.amount)}</td>
    </tr>
  `).join("");

  const vaultFeesRows = data.vaultFeesLines.map(l => `
    <tr>
      <td>${l.feeTypeName}</td>
      <td>${l.poolName}</td>
      <td>${l.basis}</td>
      <td class="right">—</td>
      <td class="right bold">${fmt(l.amount)}</td>
    </tr>
  `).join("");

  const txRows = data.txDetailLines.map(d => `
    <tr>
      <td>${d.date}</td>
      <td>${d.type}</td>
      <td>${d.member}</td>
      <td class="right">${fmt(d.amount)}</td>
      <td class="right">${d.adminPct}%</td>
      <td class="right bold">${fmt(d.adminFee)}</td>
    </tr>
  `).join("");

  const logoHtml = data.logoUrl
    ? `<img src="${data.logoUrl}" alt="Logo" style="max-height:60px;max-width:200px;" />`
    : "";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Administrator Invoice — ${data.runDate}</title>
<style>
  @page { size: A4; margin: 15mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #1a1a1a; line-height: 1.4; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; border-bottom: 3px solid #b8860b; padding-bottom: 12px; }
  .header-left { display: flex; align-items: center; gap: 12px; }
  .header-right { text-align: right; }
  .header-right h1 { font-size: 22px; color: #b8860b; margin-bottom: 4px; }
  .header-right p { font-size: 11px; color: #666; }
  .invoice-meta { display: flex; justify-content: space-between; margin-bottom: 16px; padding: 10px; background: #f8f6f0; border-radius: 4px; }
  .invoice-meta div { }
  .invoice-meta .label { font-size: 9px; text-transform: uppercase; color: #888; letter-spacing: 0.5px; }
  .invoice-meta .value { font-size: 12px; font-weight: 600; }
  h2 { font-size: 13px; color: #333; margin: 16px 0 6px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  th { background: #f5f5f0; text-align: left; padding: 6px 8px; font-size: 10px; text-transform: uppercase; color: #666; border-bottom: 2px solid #ddd; }
  td { padding: 5px 8px; border-bottom: 1px solid #eee; font-size: 11px; }
  .right { text-align: right; }
  .bold { font-weight: 600; }
  .subtotal-row { background: #f8f6f0; }
  .subtotal-row td { font-weight: 700; border-top: 2px solid #ddd; }
  .grand-total { background: #b8860b; color: #fff; }
  .grand-total td { font-weight: 700; font-size: 13px; padding: 10px 8px; border: none; }
  .summary-box { margin-top: 20px; border: 2px solid #b8860b; border-radius: 6px; overflow: hidden; }
  .summary-box h3 { background: #b8860b; color: #fff; padding: 8px 12px; font-size: 12px; margin: 0; }
  .summary-row { display: flex; justify-content: space-between; padding: 8px 12px; border-bottom: 1px solid #eee; }
  .summary-row:last-child { border-bottom: none; }
  .summary-row.total { background: #f8f6f0; font-weight: 700; font-size: 14px; }
  .footer { margin-top: 30px; text-align: center; font-size: 9px; color: #999; border-top: 1px solid #eee; padding-top: 8px; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>

<div class="header">
  <div class="header-left">
    ${logoHtml}
    <div>
      <div style="font-size:14px;font-weight:700;">${data.legalEntityName || data.tenantName}</div>
      <div style="font-size:10px;color:#666;">Administrator Invoice</div>
    </div>
  </div>
  <div class="header-right">
    <h1>INVOICE</h1>
    <p>Month-End Fee Run</p>
  </div>
</div>

<div class="invoice-meta">
  <div>
    <div class="label">Invoice To</div>
    <div class="value">${data.tenantName}</div>
  </div>
  <div>
    <div class="label">Invoice Date</div>
    <div class="value">${data.invoiceDate}</div>
  </div>
  <div>
    <div class="label">Period End Date</div>
    <div class="value">${data.runDate}</div>
  </div>
  <div>
    <div class="label">Total Due</div>
    <div class="value" style="color:#b8860b;font-size:14px;">${fmt(data.grandTotal)}</div>
  </div>
</div>

${data.adminFeesLines.length > 0 ? `
<h2>Monthly Administrator Fees (% of Portfolio Values)</h2>
<table>
  <thead>
    <tr>
      <th>Fee Type</th>
      <th>Pool</th>
      <th>Basis</th>
      <th class="right">Pool Value</th>
      <th class="right">Amount</th>
    </tr>
  </thead>
  <tbody>
    ${adminFeesRows}
    <tr class="subtotal-row">
      <td colspan="4" class="right">Subtotal Admin Fees</td>
      <td class="right">${fmt(data.totalAdminFees)}</td>
    </tr>
  </tbody>
</table>
` : ""}

${data.vaultFeesLines.length > 0 ? `
<h2>Vault Fees</h2>
<table>
  <thead>
    <tr>
      <th>Fee Type</th>
      <th>Pool</th>
      <th>Basis</th>
      <th class="right">Pool Value</th>
      <th class="right">Amount</th>
    </tr>
  </thead>
  <tbody>
    ${vaultFeesRows}
    <tr class="subtotal-row">
      <td colspan="4" class="right">Subtotal Vault Fees</td>
      <td class="right">${fmt(data.totalVaultFees)}</td>
    </tr>
  </tbody>
</table>
` : ""}

${data.txDetailLines.length > 0 ? `
<h2>Transactional Administrator Fees</h2>
<table>
  <thead>
    <tr>
      <th>Date</th>
      <th>Type</th>
      <th>Member</th>
      <th class="right">Amount</th>
      <th class="right">Admin %</th>
      <th class="right">Admin Fee</th>
    </tr>
  </thead>
  <tbody>
    ${txRows}
    <tr class="subtotal-row">
      <td colspan="5" class="right">Subtotal Transactional Fees</td>
      <td class="right">${fmt(data.totalTransactionalFees)}</td>
    </tr>
  </tbody>
</table>
` : ""}

<div class="summary-box">
  <h3>Invoice Summary</h3>
  ${data.totalAdminFees > 0 ? `
  <div class="summary-row">
    <span>Monthly Admin Fees (% of Portfolio Values)</span>
    <span>${fmt(data.totalAdminFees)}</span>
  </div>` : ""}
  ${data.totalVaultFees > 0 ? `
  <div class="summary-row">
    <span>Vault Fees</span>
    <span>${fmt(data.totalVaultFees)}</span>
  </div>` : ""}
  ${data.totalTransactionalFees > 0 ? `
  <div class="summary-row">
    <span>Transactional Admin Fees</span>
    <span>${fmt(data.totalTransactionalFees)}</span>
  </div>` : ""}
  <div class="summary-row total">
    <span>Total Payable to Administrator</span>
    <span style="color:#b8860b;">${fmt(data.grandTotal)}</span>
  </div>
</div>

<div class="footer">
  Generated on ${new Date().toLocaleDateString("en-ZA")} • ${data.legalEntityName || data.tenantName}
</div>

</body>
</html>`;
}

export function openInvoicePrintWindow(html: string) {
  const printWindow = window.open("", "_blank", "width=800,height=1000");
  if (!printWindow) {
    alert("Please allow pop-ups to generate the invoice.");
    return;
  }
  printWindow.document.write(html);
  printWindow.document.close();
  setTimeout(() => printWindow.print(), 500);
}
