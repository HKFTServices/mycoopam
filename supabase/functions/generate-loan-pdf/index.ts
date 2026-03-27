import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function formatCurrency(n: number) {
  return "R " + n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildAodHtml(loan: any, entity: any, account: any) {
  const capital = Number(loan.amount_approved ?? loan.amount_requested ?? 0);
  const term = Number(loan.term_months_approved ?? loan.term_months_requested ?? 0);
  const interestRate = Number(loan.interest_rate ?? 0);
  const loanFee = Number(loan.loan_fee ?? 0);
  const totalInterest = capital * term * (interestRate / 100) / 12;
  const totalLoan = Number(loan.total_loan ?? capital + totalInterest + loanFee);
  const monthlyInstalment = Number(loan.monthly_instalment ?? (term > 0 ? totalLoan / term : 0));
  const entityName = [entity?.name, entity?.last_name].filter(Boolean).join(" ");

  // Build schedule rows
  let scheduleRows = "";
  if (term > 0 && capital > 0) {
    const mCap = capital / term;
    const mInt = totalInterest / term;
    let bal = totalLoan;
    const start = new Date(loan.loan_date);
    for (let m = 1; m <= term; m++) {
      const d = new Date(start);
      d.setMonth(d.getMonth() + m);
      bal -= monthlyInstalment;
      scheduleRows += `<tr>
        <td style="padding:4px;border:1px solid #ddd">${m}</td>
        <td style="padding:4px;border:1px solid #ddd">${d.toLocaleDateString("en-ZA")}</td>
        <td style="padding:4px;border:1px solid #ddd;text-align:right">${formatCurrency(mCap)}</td>
        <td style="padding:4px;border:1px solid #ddd;text-align:right">${formatCurrency(mInt)}</td>
        <td style="padding:4px;border:1px solid #ddd;text-align:right;font-weight:bold">${formatCurrency(monthlyInstalment)}</td>
        <td style="padding:4px;border:1px solid #ddd;text-align:right">${formatCurrency(Math.max(bal, 0))}</td>
      </tr>`;
    }
  }

  const memberSig = loan.member_signature_data
    ? `<img src="${loan.member_signature_data}" style="max-width:250px;height:auto;border:1px solid #ccc;border-radius:4px" /><br/><small>Signed: ${loan.member_accepted_at ? new Date(loan.member_accepted_at).toLocaleString("en-ZA") : ""}</small>`
    : "<div style='border-bottom:1px dashed #999;height:40px'></div>";

  const adminSig = loan.admin_signature_data
    ? `<img src="${loan.admin_signature_data}" style="max-width:250px;height:auto;border:1px solid #ccc;border-radius:4px" /><br/><small>Signed: ${loan.admin_signed_at ? new Date(loan.admin_signed_at).toLocaleString("en-ZA") : ""}</small>`
    : "<div style='border-bottom:1px dashed #999;height:40px'></div>";

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Acknowledgment of Debt</title>
<style>body{font-family:Arial,sans-serif;margin:40px;color:#333}h1{text-align:center;font-size:20px}table{border-collapse:collapse;width:100%}td,th{padding:6px;text-align:left}.grid{display:flex;gap:40px}.grid>div{flex:1}</style>
</head><body>
<h1>ACKNOWLEDGMENT OF DEBT</h1>
<p>I, <strong>${entityName}</strong> (ID: ${entity?.identity_number ?? "N/A"}), hereby acknowledge that I am indebted to the Cooperative in the amount and on the terms set out below:</p>

<table style="margin:20px 0">
<tr><td style="padding:4px"><strong>Loan Date:</strong></td><td>${loan.loan_date}</td></tr>
<tr><td style="padding:4px"><strong>Capital Amount:</strong></td><td>${formatCurrency(capital)}</td></tr>
<tr><td style="padding:4px"><strong>Interest Rate:</strong></td><td>${interestRate}% per annum (simple)</td></tr>
<tr><td style="padding:4px"><strong>Term:</strong></td><td>${term} months</td></tr>
<tr><td style="padding:4px"><strong>Interest Loading:</strong></td><td>${formatCurrency(totalInterest)}</td></tr>
<tr><td style="padding:4px"><strong>Loan Issue Fee:</strong></td><td>${formatCurrency(loanFee)}</td></tr>
<tr><td style="padding:4px"><strong>Total Amount Due:</strong></td><td><strong>${formatCurrency(totalLoan)}</strong></td></tr>
<tr><td style="padding:4px"><strong>Monthly Instalment:</strong></td><td><strong>${formatCurrency(monthlyInstalment)}</strong></td></tr>
<tr><td style="padding:4px"><strong>Account Number:</strong></td><td>${account?.account_number ?? ""}</td></tr>
</table>

${loan.disbursement_reference ? `
<h3>Disbursement Details</h3>
<table>
<tr><td style="padding:4px"><strong>Payment Reference:</strong></td><td>${loan.disbursement_reference}</td></tr>
<tr><td style="padding:4px"><strong>Payment Date:</strong></td><td>${loan.disbursement_date}</td></tr>
<tr><td style="padding:4px"><strong>Amount Paid:</strong></td><td>${formatCurrency(Number(loan.disbursement_amount ?? 0))}</td></tr>
</table>` : ""}

<h3>Repayment Schedule</h3>
<table style="font-size:12px">
<thead><tr style="background:#f0f0f0">
<th style="padding:4px;border:1px solid #ddd">#</th>
<th style="padding:4px;border:1px solid #ddd">Date</th>
<th style="padding:4px;border:1px solid #ddd;text-align:right">Capital</th>
<th style="padding:4px;border:1px solid #ddd;text-align:right">Interest</th>
<th style="padding:4px;border:1px solid #ddd;text-align:right">Instalment</th>
<th style="padding:4px;border:1px solid #ddd;text-align:right">Balance</th>
</tr></thead>
<tbody>${scheduleRows}</tbody>
</table>

<p style="margin-top:20px;font-size:13px"><strong>Terms:</strong> I agree to repay the total amount in equal monthly instalments as set out in the schedule above. Failure to maintain payments may result in the outstanding balance being deducted from my pool holdings.</p>

<div class="grid" style="margin-top:30px;display:flex;gap:40px">
<div style="flex:1"><p><strong>Member Signature</strong></p>${memberSig}</div>
<div style="flex:1"><p><strong>Admin Signature</strong></p>${adminSig}</div>
</div>

</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { loan_application_id } = await req.json();
    if (!loan_application_id) {
      return new Response(JSON.stringify({ error: "loan_application_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the loan application with entity and account
    const { data: loan, error: loanErr } = await supabase
      .from("loan_applications")
      .select("*, entities(*), entity_accounts(*)")
      .eq("id", loan_application_id)
      .single();

    if (loanErr || !loan) {
      return new Response(JSON.stringify({ error: "Loan not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get email settings
    const { data: emailSettings } = await supabase
      .from("tenant_configuration")
      .select("smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from_email, smtp_from_name")
      .eq("tenant_id", loan.tenant_id)
      .maybeSingle();

    if (!emailSettings?.smtp_host) {
      console.warn("No SMTP configured, skipping email");
      return new Response(JSON.stringify({ message: "No SMTP configured, skipping" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build HTML
    const html = buildAodHtml(loan, loan.entities, loan.entity_accounts);

    // Convert HTML to a "PDF-like" attachment (HTML file as attachment for now)
    // For true PDF, we'd need a headless browser or PDF library
    const htmlBuffer = new TextEncoder().encode(html);

    const entityName = [loan.entities?.name, loan.entities?.last_name].filter(Boolean).join(" ");
    const fileName = `AOD_${entityName.replace(/\s+/g, "_")}_${loan.loan_date}.html`;

    // Get member email
    const memberEmail = loan.entities?.email_address;

    // Get admin email (the user who signed)
    let adminEmail: string | null = null;
    if (loan.reviewed_by) {
      const { data: adminProfile } = await supabase
        .from("profiles")
        .select("email")
        .eq("user_id", loan.reviewed_by)
        .single();
      adminEmail = adminProfile?.email ?? null;
    }

    const transporter = nodemailer.createTransport({
      host: emailSettings.smtp_host,
      port: Number(emailSettings.smtp_port ?? 587),
      secure: Number(emailSettings.smtp_port ?? 587) === 465,
      auth: {
        user: emailSettings.smtp_user,
        pass: emailSettings.smtp_pass,
      },
    });

    const recipients = [memberEmail, adminEmail].filter(Boolean).join(", ");
    if (!recipients) {
      return new Response(JSON.stringify({ message: "No recipients found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await transporter.sendMail({
      from: `"${emailSettings.smtp_from_name ?? "MyCoop"}" <${emailSettings.smtp_from_email ?? emailSettings.smtp_user}>`,
      to: recipients,
      subject: `Acknowledgment of Debt — ${entityName}`,
      html: `<p>Please find the signed Acknowledgment of Debt attached for loan dated ${loan.loan_date}.</p>
<p>Capital: ${formatCurrency(Number(loan.amount_approved ?? 0))}<br/>
Total Loan: ${formatCurrency(Number(loan.total_loan ?? 0))}<br/>
Monthly Instalment: ${formatCurrency(Number(loan.monthly_instalment ?? 0))}</p>
<p>Payment Ref: ${loan.disbursement_reference ?? "N/A"}<br/>
Amount Paid: ${formatCurrency(Number(loan.disbursement_amount ?? 0))}</p>`,
      attachments: [
        {
          filename: fileName,
          content: htmlBuffer,
          contentType: "text/html",
        },
      ],
    });

    return new Response(JSON.stringify({ success: true, recipients }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("generate-loan-pdf error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
