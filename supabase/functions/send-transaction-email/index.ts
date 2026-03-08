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

    // Verify the calling user
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

    // Fetch member profile (linked user)
    const { data: profile } = await adminClient
      .from("profiles")
      .select("first_name, last_name, email, language_code")
      .eq("user_id", user_id)
      .single();

    if (!profile?.email) {
      console.warn(`[send-transaction-email] No email found for user ${user_id}`);
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
      .select("smtp_host, smtp_port, smtp_username, smtp_password, smtp_from_email, smtp_from_name, smtp_enable_ssl, email_signature_en, email_signature_af, legal_entity_id")
      .eq("tenant_id", tenant_id)
      .maybeSingle();

    if (!tenantConfig?.smtp_host || !tenantConfig?.smtp_from_email) {
      console.warn(`[send-transaction-email] SMTP not configured for tenant ${tenant_id}`);
      return new Response(JSON.stringify({ success: false, error: "SMTP not configured" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve admin email from the legal entity linked in tenant_configuration
    let adminNotifyEmail: string | null = null;
    if (tenantConfig.legal_entity_id) {
      const { data: legalEntity } = await adminClient
        .from("entities")
        .select("email_address")
        .eq("id", tenantConfig.legal_entity_id)
        .single();
      adminNotifyEmail = legalEntity?.email_address || null;
    }

    // ── Resolve entity email + name (from the entity linked to the account) ──
    const txn = transaction_data || {};
    let entityEmail: string | null = null;
    let entityAccountName = "";
    if (txn.account_number) {
      const { data: entityAcct } = await adminClient
        .from("entity_accounts")
        .select("entity_id")
        .eq("tenant_id", tenant_id)
        .eq("account_number", txn.account_number)
        .maybeSingle();
      if (entityAcct?.entity_id) {
        const { data: entity } = await adminClient
          .from("entities")
          .select("email_address, name, last_name")
          .eq("id", entityAcct.entity_id)
          .single();
        entityEmail = entity?.email_address || null;
        entityAccountName = [entity?.name, entity?.last_name].filter(Boolean).join(" ");
      }
    }

    // Fetch communication template: custom (non-system) first, then system default fallback
    const userLang = profile.language_code || "en";
    let template: { subject: string; body_html: string } | null = null;

    // 1. Try custom tenant template in user's language
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

    // 2. Fallback: custom tenant template in English
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

    // 3. Fallback: system default template in user's language
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

    // 4. Fallback: system default template in English
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

    // Fetch email footer template
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

    const firstName = profile.first_name || "Member";
    const lastName = profile.last_name || "";

    // Resolve tenant display name: prefer legal entity name over tenant.name
    let tenantName = tenant?.name || "the cooperative";
    if (tenantConfig.legal_entity_id) {
      const { data: legalEntity } = await adminClient
        .from("entities")
        .select("name")
        .eq("id", tenantConfig.legal_entity_id)
        .single();
      if (legalEntity?.name) tenantName = legalEntity.name;
    }

    // Translate transaction type for Afrikaans
    const rawTxnType = txn.transaction_type || "";
    const translatedTxnType = userLang === "af"
      ? (TX_TYPE_AF[rawTxnType] || rawTxnType)
      : rawTxnType;

    // Build default fallback body — NO amounts, only date + type + account info
    const defaultSubject = `Transaction Confirmation — ${translatedTxnType || application_event}`;
    // entityAccountName already resolved above from entity lookup
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

    // Append footer
    if (footerHtml) {
      body = body + footerHtml;
    }

    // Build email signature for placeholder replacement and auto-append
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
      "{{email}}": profile.email,
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

    // Auto-append signature if template didn't use the {{email_signature}} placeholder
    if (resolvedSignature && !body.includes(resolvedSignature)) {
      body = body + resolvedSignature;
    }

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

    // Use smtp_username as from address if it contains @ (to match mail server auth)
    const isSmtpUserEmail = tenantConfig.smtp_username?.includes("@");
    const effectiveFromEmail = isSmtpUserEmail ? tenantConfig.smtp_username : tenantConfig.smtp_from_email;
    const fromHeader = tenantConfig.smtp_from_name
      ? `"${tenantConfig.smtp_from_name}" <${effectiveFromEmail}>`
      : effectiveFromEmail;

    // Helper to log email send attempts
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

    // ── Build recipient list (deduplicated) ──
    const recipientSet = new Set<string>();
    recipientSet.add(profile.email.toLowerCase());
    if (entityEmail && !recipientSet.has(entityEmail.toLowerCase())) {
      recipientSet.add(entityEmail.toLowerCase());
    }

    // ── Send to member + entity email ──
    let memberSent = false;
    let memberMessageId = "";
    for (const recipientAddr of recipientSet) {
      try {
        const info = await transporter.sendMail({
          from: fromHeader,
          to: recipientAddr,
          subject,
          html: body,
        });
        memberSent = true;
        if (recipientAddr === profile.email.toLowerCase()) {
          memberMessageId = info.messageId;
        }
        console.log(`[send-transaction-email] Email sent: ${info.messageId} to ${recipientAddr}`);
        await logEmail(recipientAddr, recipientAddr === profile.email.toLowerCase() ? user_id : null, subject, "sent", null, info.messageId);
      } catch (err: any) {
        console.error(`[send-transaction-email] Email failed to ${recipientAddr}: ${err.message}`);
        await logEmail(recipientAddr, recipientAddr === profile.email.toLowerCase() ? user_id : null, subject, "failed", err.message, null);
      }
    }

    // ── Send to admin (notification copy) ──
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
        message_id: memberMessageId || undefined,
        recipient: profile.email,
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
