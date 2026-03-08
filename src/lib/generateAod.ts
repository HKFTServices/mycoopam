import { formatCurrency } from "./formatCurrency";

interface AodParams {
  entityName: string;
  identityNumber: string;
  loanDate: string;
  capital: number;
  interestRate: number;
  term: number;
  loanFee: number;
  totalInterest: number;
  totalLoan: number;
  monthlyInstalment: number;
  accountNumber: string;
}

export function generateAodHtml(params: AodParams): string {
  const {
    entityName, identityNumber, loanDate, capital, interestRate,
    term, loanFee, totalInterest, totalLoan, monthlyInstalment, accountNumber,
  } = params;

  // Build repayment schedule rows
  const scheduleRows: string[] = [];
  const monthlyCapital = capital / term;
  const monthlyInterestPortion = totalInterest / term;
  let balance = totalLoan;
  const startDate = new Date(loanDate);

  for (let m = 1; m <= term; m++) {
    const payDate = new Date(startDate);
    payDate.setMonth(payDate.getMonth() + m);
    balance -= monthlyInstalment;
    scheduleRows.push(`
      <tr>
        <td style="padding:4px 8px;border:1px solid #ddd;text-align:center">${m}</td>
        <td style="padding:4px 8px;border:1px solid #ddd">${payDate.toLocaleDateString("en-ZA")}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;text-align:right">${formatCurrency(monthlyCapital)}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;text-align:right">${formatCurrency(monthlyInterestPortion)}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;text-align:right;font-weight:bold">${formatCurrency(monthlyInstalment)}</td>
        <td style="padding:4px 8px;border:1px solid #ddd;text-align:right">${formatCurrency(Math.max(balance, 0))}</td>
      </tr>
    `);
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Acknowledgment of Debt — ${entityName}</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #333; }
    h1 { text-align: center; font-size: 20px; margin-bottom: 30px; }
    .field-row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dotted #ccc; }
    .field-label { color: #666; }
    .field-value { font-weight: bold; font-family: monospace; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 12px; }
    th { background: #f5f5f5; padding: 6px 8px; border: 1px solid #ddd; text-align: left; }
    .sig-row { display: flex; justify-content: space-between; margin-top: 60px; }
    .sig-block { width: 45%; }
    .sig-line { border-bottom: 1px solid #333; height: 40px; margin-bottom: 4px; }
    .sig-label { font-size: 12px; color: #666; }
    @media print { body { margin: 20px; } }
  </style>
</head>
<body>
  <h1>ACKNOWLEDGMENT OF DEBT</h1>

  <p>I, <strong>${entityName}</strong>${identityNumber ? ` (ID: ${identityNumber})` : ""}, 
  hereby acknowledge that I am indebted to the Cooperative in the amount and on the terms set out below:</p>

  <div style="background:#f9f9f9; padding:16px; border-radius:8px; margin:20px 0;">
    <div class="field-row"><span class="field-label">Account Number:</span><span class="field-value">${accountNumber}</span></div>
    <div class="field-row"><span class="field-label">Loan Date:</span><span class="field-value">${loanDate}</span></div>
    <div class="field-row"><span class="field-label">Capital Amount:</span><span class="field-value">${formatCurrency(capital)}</span></div>
    <div class="field-row"><span class="field-label">Interest Rate:</span><span class="field-value">${interestRate}% per annum (simple)</span></div>
    <div class="field-row"><span class="field-label">Term:</span><span class="field-value">${term} months</span></div>
    <div class="field-row"><span class="field-label">Interest Loading:</span><span class="field-value">${formatCurrency(totalInterest)}</span></div>
    <div class="field-row"><span class="field-label">Loan Issue Fee:</span><span class="field-value">${formatCurrency(loanFee)}</span></div>
    <div class="field-row" style="border-bottom:2px solid #333;font-size:16px;"><span class="field-label"><strong>Total Amount Due:</strong></span><span class="field-value">${formatCurrency(totalLoan)}</span></div>
    <div class="field-row"><span class="field-label">Monthly Instalment:</span><span class="field-value" style="color:#0066cc">${formatCurrency(monthlyInstalment)}</span></div>
  </div>

  <p style="font-size:12px;color:#666">Formula: Total = Capital × (1 + term × rate/12) + Fee</p>

  <h3 style="font-size:14px;margin-top:24px;">Repayment Schedule</h3>
  <table>
    <thead>
      <tr>
        <th style="text-align:center">#</th>
        <th>Date</th>
        <th style="text-align:right">Capital</th>
        <th style="text-align:right">Interest</th>
        <th style="text-align:right">Instalment</th>
        <th style="text-align:right">Balance</th>
      </tr>
    </thead>
    <tbody>
      ${scheduleRows.join("")}
    </tbody>
  </table>

  <h3 style="font-size:14px;margin-top:24px;">Terms and Conditions</h3>
  <ol style="font-size:12px;line-height:1.6">
    <li>I agree to repay the total amount in equal monthly instalments as set out in the schedule above.</li>
    <li>Payment shall be made on or before the due date each month.</li>
    <li>In the event of default, the full outstanding balance becomes immediately due and payable.</li>
    <li>The Cooperative reserves the right to deduct any outstanding amounts from my pool holdings.</li>
    <li>This acknowledgment of debt shall be governed by the laws of the Republic of South Africa.</li>
  </ol>

  <div class="sig-row">
    <div class="sig-block">
      <div class="sig-line"></div>
      <div class="sig-label">Member Signature</div>
      <div class="sig-label">Date: _______________</div>
    </div>
    <div class="sig-block">
      <div class="sig-line"></div>
      <div class="sig-label">Authorised Signatory</div>
      <div class="sig-label">Date: _______________</div>
    </div>
  </div>
</body>
</html>`;
}
