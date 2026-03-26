import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.10";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
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
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller
    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await anonClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { txn_id, document_type, send_email } = await req.json();
    // document_type: "purchase_order" | "sales_order" | "tax_invoice" | "delivery_note"

    if (!txn_id || !document_type) {
      return new Response(JSON.stringify({ error: "txn_id and document_type are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch transaction
    const { data: txn, error: txnErr } = await admin
      .from("admin_stock_transactions" as any)
      .select("*")
      .eq("id", txn_id)
      .single();

    if (txnErr || !txn) {
      console.error("[send-stock-document] txn fetch error:", txnErr?.message, "txn_id:", txn_id);
      return new Response(JSON.stringify({ error: "Transaction not found", details: txnErr?.message }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch counterparty entity account + entity separately
    let counterpartyEntity: any = null;
    if ((txn as any).counterparty_entity_account_id) {
      const { data: cpAccount } = await admin
        .from("entity_accounts" as any)
        .select("id, account_number, entity_id")
        .eq("id", (txn as any).counterparty_entity_account_id)
        .single();
      if (cpAccount?.entity_id) {
        const { data: cpEnt } = await admin
          .from("entities" as any)
          .select("id, name, last_name, email_address, registration_number, vat_number, contact_number")
          .eq("id", cpAccount.entity_id)
          .single();
        counterpartyEntity = cpEnt ?? null;
      }
    }

    // Fetch line items
    const { data: lines } = await admin
      .from("admin_stock_transaction_lines" as any)
      .select("*, items(description, item_code), pools(name)")
      .eq("admin_stock_transaction_id", txn_id)
      .order("pool_id");

    // Fetch tenant config (SMTP + branding)
    const { data: tenantCfg } = await admin
      .from("tenant_configuration" as any)
      .select(`
        smtp_host, smtp_port, smtp_username, smtp_password, smtp_from_email, smtp_from_name, smtp_enable_ssl,
        logo_url, is_vat_registered, vat_number, currency_symbol,
        legal_entity_id, email_signature_en, email_signature_af
      `)
      .eq("tenant_id", (txn as any).tenant_id)
      .maybeSingle();

    const { data: tenant } = await admin
      .from("tenants" as any)
      .select("name")
      .eq("id", (txn as any).tenant_id)
      .single();

    // Fetch legal entity name if available
    let legalEntityName = tenant?.name ?? "Organisation";
    if (tenantCfg?.legal_entity_id) {
      const { data: le } = await admin
        .from("entities" as any)
        .select("name, last_name, registration_number, vat_number, contact_number, email_address")
        .eq("id", tenantCfg.legal_entity_id)
        .single();
      if (le) {
        legalEntityName = [le.name, le.last_name].filter(Boolean).join(" ");
      }
    }

    const isPurchase = (txn as any).transaction_type_code === "STOCK_PURCHASES";
    const isSale = (txn as any).transaction_type_code === "STOCK_SALES";
    const currSymbol = tenantCfg?.currency_symbol ?? "R";
    const counterparty = counterpartyEntity;
    const counterpartyName = counterparty
      ? [counterparty.name, counterparty.last_name].filter(Boolean).join(" ")
      : "—";
    const counterpartyEmail = counterparty?.email_address ?? null;

    const formatAmt = (n: number) =>
      `${currSymbol} ${Number(n).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const txnDate = (txn as any).transaction_date
      ? new Date((txn as any).transaction_date).toLocaleDateString("en-ZA", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        })
      : "—";

    // ── Build line items HTML ──
    const lineRows = (lines ?? [])
      .map(
        (l: any) => `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;font-family:Arial,sans-serif;font-size:13px;">${l.items?.item_code ?? "—"}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;font-family:Arial,sans-serif;font-size:13px;">${l.items?.description ?? "—"} <span style="color:#888;font-size:11px;">(${l.pools?.name ?? "—"})</span></td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;font-family:Arial,sans-serif;font-size:13px;text-align:right;">${Number(l.quantity)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;font-family:Arial,sans-serif;font-size:13px;text-align:right;">${formatAmt(l.unit_price_excl_vat)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;font-family:Arial,sans-serif;font-size:13px;text-align:right;">${formatAmt(l.line_total_excl_vat)}</td>
        ${tenantCfg?.is_vat_registered ? `<td style="padding:6px 10px;border-bottom:1px solid #eee;font-family:Arial,sans-serif;font-size:13px;text-align:right;">${formatAmt(l.line_vat)}</td>` : ""}
        <td style="padding:6px 10px;border-bottom:1px solid #eee;font-family:Arial,sans-serif;font-size:13px;text-align:right;font-weight:600;">${formatAmt(l.line_total_incl_vat)}</td>
      </tr>`
      )
      .join("");

    const vatHeader = tenantCfg?.is_vat_registered
      ? `<th style="padding:8px 10px;background:#f4f4f4;text-align:right;font-family:Arial,sans-serif;font-size:12px;">VAT</th>`
      : "";

    const logoHtml = tenantCfg?.logo_url
      ? `<img src="${tenantCfg.logo_url}" alt="${legalEntityName}" style="height:48px;max-width:160px;width:auto;object-fit:contain;" />`
      : `<span style="font-size:24px;font-weight:800;color:#1a1a2e;">${legalEntityName}</span>`;

    const docTitles: Record<string, string> = {
      purchase_order: "PURCHASE ORDER",
      sales_order: "SALES ORDER / QUOTE",
      tax_invoice: "TAX INVOICE",
      delivery_note: "DELIVERY NOTE",
    };

    const docTitle = docTitles[document_type] ?? "DOCUMENT";
    const docNumber = (txn as any).reference ?? txn_id.slice(0, 8).toUpperCase();

    // Sender info (us = legalEntityName) / Receiver info (counterparty)
    const senderLabel = isPurchase ? "To (Supplier):" : "To (Customer):";
    const fromLabel = "From:";

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>${docTitle} — ${docNumber}</title>
<style>
  @media print {
    body { margin: 0; }
    .no-print { display: none; }
  }
  body { font-family: Arial, sans-serif; color: #222; background: #fff; margin: 0; padding: 0; }
</style>
</head>
<body style="padding:0;margin:0;">
  <div style="max-width:780px;margin:0 auto;padding:32px 40px;">
    <!-- Header -->
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="vertical-align:top;">${logoHtml}</td>
        <td style="vertical-align:top;text-align:right;">
          <div style="font-size:26px;font-weight:900;color:#1a1a2e;letter-spacing:-0.5px;">${docTitle}</div>
          <div style="font-size:13px;color:#555;margin-top:4px;">No: <strong>${docNumber}</strong></div>
          <div style="font-size:13px;color:#555;margin-top:2px;">Date: <strong>${txnDate}</strong></div>
          ${tenantCfg?.is_vat_registered ? `<div style="font-size:12px;color:#888;margin-top:2px;">VAT Reg: ${tenantCfg?.vat_number ?? "—"}</div>` : ""}
        </td>
      </tr>
    </table>

    <hr style="border:none;border-top:2px solid #1a1a2e;margin:24px 0;" />

    <!-- From / To -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="vertical-align:top;width:50%;">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#888;margin-bottom:4px;">${fromLabel}</div>
          <div style="font-size:14px;font-weight:700;">${legalEntityName}</div>
        </td>
        <td style="vertical-align:top;width:50%;padding-left:24px;">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#888;margin-bottom:4px;">${senderLabel}</div>
          <div style="font-size:14px;font-weight:700;">${counterpartyName}</div>
          ${counterparty?.registration_number ? `<div style="font-size:12px;color:#555;">Reg: ${counterparty.registration_number}</div>` : ""}
          ${counterparty?.vat_number ? `<div style="font-size:12px;color:#555;">VAT: ${counterparty.vat_number}</div>` : ""}
          ${counterparty?.contact_number ? `<div style="font-size:12px;color:#555;">Tel: ${counterparty.contact_number}</div>` : ""}
          ${counterpartyEmail ? `<div style="font-size:12px;color:#555;">${counterpartyEmail}</div>` : ""}
        </td>
      </tr>
    </table>

    <!-- Line Items Table -->
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
      <thead>
        <tr style="background:#f4f4f4;">
          <th style="padding:8px 10px;text-align:left;font-family:Arial,sans-serif;font-size:12px;">Code</th>
          <th style="padding:8px 10px;text-align:left;font-family:Arial,sans-serif;font-size:12px;">Description</th>
          <th style="padding:8px 10px;text-align:right;font-family:Arial,sans-serif;font-size:12px;">Qty</th>
          <th style="padding:8px 10px;text-align:right;font-family:Arial,sans-serif;font-size:12px;">Unit Price (excl.)</th>
          <th style="padding:8px 10px;text-align:right;font-family:Arial,sans-serif;font-size:12px;">Subtotal</th>
          ${vatHeader}
          <th style="padding:8px 10px;text-align:right;font-family:Arial,sans-serif;font-size:12px;">Total (incl.)</th>
        </tr>
      </thead>
      <tbody>${lineRows}</tbody>
    </table>

    <!-- Totals -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">
      <tr>
        <td width="60%"></td>
        <td width="40%">
          <table width="100%" cellpadding="4" cellspacing="0">
            <tr>
              <td style="font-size:13px;color:#555;">Subtotal (excl. VAT)</td>
              <td style="font-size:13px;text-align:right;">${formatAmt(Number((txn as any).total_excl_vat))}</td>
            </tr>
            ${Number((txn as any).total_vat) > 0 ? `
            <tr>
              <td style="font-size:13px;color:#555;">VAT</td>
              <td style="font-size:13px;text-align:right;">${formatAmt(Number((txn as any).total_vat))}</td>
            </tr>` : ""}
            <tr style="border-top:2px solid #1a1a2e;">
              <td style="font-size:16px;font-weight:800;padding-top:8px;">TOTAL</td>
              <td style="font-size:16px;font-weight:800;text-align:right;padding-top:8px;">${formatAmt(Number((txn as any).total_invoice_amount))}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    ${(txn as any).notes ? `<div style="margin-top:20px;padding:12px;background:#f9f9f9;border-radius:6px;font-size:12px;color:#555;"><strong>Notes:</strong> ${(txn as any).notes}</div>` : ""}

    <div style="margin-top:40px;font-size:11px;color:#aaa;text-align:center;">
      Generated by ${legalEntityName} · ${new Date().toLocaleDateString("en-ZA")}
    </div>
  </div>
</body>
</html>`;

    // Return HTML for download (frontend will open in new tab for PDF print)
    if (!send_email) {
      return new Response(JSON.stringify({ success: true, html, document_type, doc_number: docNumber }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Send via SMTP ──
    if (!counterpartyEmail) {
      return new Response(
        JSON.stringify({ error: "Counterparty has no email address on their entity record" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!tenantCfg?.smtp_host || !tenantCfg?.smtp_from_email) {
      return new Response(
        JSON.stringify({ error: "SMTP not configured in Tenant Configuration" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const requestedPort = tenantCfg.smtp_port || 587;
    const usePort = requestedPort === 465 ? 587 : requestedPort;

    const transporter = nodemailer.createTransport({
      host: tenantCfg.smtp_host,
      port: usePort,
      secure: false,
      ignoreTLS: true,
      auth: tenantCfg.smtp_username
        ? { user: tenantCfg.smtp_username, pass: tenantCfg.smtp_password || "" }
        : undefined,
    });

    const subjectMap: Record<string, string> = {
      purchase_order: `Purchase Order ${docNumber} from ${legalEntityName}`,
      sales_order: `Sales Order / Quote ${docNumber} — ${legalEntityName}`,
      tax_invoice: `Tax Invoice ${docNumber} from ${legalEntityName}`,
      delivery_note: `Delivery Note ${docNumber} — ${legalEntityName}`,
    };

    // Use smtp_username as the actual sender if it looks like an email address,
    // since many mail servers reject sending from an address other than the auth account.
    const smtpUser = tenantCfg.smtp_username ?? "";
    const isSmtpUserEmail = smtpUser.includes("@");
    const effectiveFromEmail = isSmtpUserEmail ? smtpUser : tenantCfg.smtp_from_email;
    const fromHeader = tenantCfg.smtp_from_name
      ? `"${tenantCfg.smtp_from_name}" <${effectiveFromEmail}>`
      : effectiveFromEmail;

    // Append email signature to the HTML body
    const emailSignature = (tenantCfg as any)?.email_signature_en || "";
    const emailHtml = emailSignature
      ? html.replace("</body>", `<div style="max-width:780px;margin:0 auto;padding:0 40px;">${emailSignature}</div></body>`)
      : html;

    const info = await transporter.sendMail({
      from: fromHeader,
      to: counterpartyEmail,
      subject: subjectMap[document_type] ?? `${docTitle} ${docNumber}`,
      html: emailHtml,
    });

    console.log(`[send-stock-document] Sent ${document_type} to ${counterpartyEmail}: ${info.messageId}`);

    return new Response(
      JSON.stringify({ success: true, messageId: info.messageId, sent_to: counterpartyEmail }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[send-stock-document]", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
