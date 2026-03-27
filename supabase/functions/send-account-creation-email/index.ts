import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
    const userId = claimsData.claims.sub as string;

    const { tenant_id, entity_account_id } = await req.json();
    if (!tenant_id) {
      return new Response(JSON.stringify({ error: "tenant_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: profile } = await adminClient
      .from("profiles")
      .select("first_name, last_name, email, language_code")
      .eq("user_id", userId)
      .single();

    if (!profile?.email) {
      return new Response(JSON.stringify({ error: "User profile or email not found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: tenant } = await adminClient
      .from("tenants")
      .select("name")
      .eq("id", tenant_id)
      .single();

    // Fetch tenant SMTP configuration (tenant-specific)
    const { data: tenantConfig } = await adminClient
      .from("tenant_configuration")
      .select("smtp_host, smtp_port, smtp_username, smtp_password, smtp_from_email, smtp_from_name, smtp_enable_ssl, email_signature_en, email_signature_af, legal_entity_id")
      .eq("tenant_id", tenant_id)
      .maybeSingle();

    // Resolve entity account name (the company/entity name linked to the account)
    let entityAccountName = "";
    let accountNumber = "";
    if (entity_account_id) {
      const { data: ea } = await adminClient
        .from("entity_accounts")
        .select("account_number, entity_id")
        .eq("id", entity_account_id)
        .single();
      if (ea) {
        accountNumber = ea.account_number || "";
        const { data: entity } = await adminClient
          .from("entities")
          .select("name, last_name")
          .eq("id", ea.entity_id)
          .single();
        entityAccountName = entity ? [entity.name, entity.last_name].filter(Boolean).join(" ") : "";
      }
    }
    // If no entity_account_id provided, try to find by user's entity
    if (!entityAccountName) {
      const { data: uer } = await adminClient
        .from("user_entity_relationships")
        .select("entity_id")
        .eq("user_id", userId)
        .eq("tenant_id", tenant_id)
        .limit(1)
        .maybeSingle();
      if (uer?.entity_id) {
        const { data: accts } = await adminClient
          .from("entity_accounts")
          .select("account_number, entity_id, entities!entity_accounts_entity_id_fkey(name, last_name)")
          .eq("entity_id", uer.entity_id)
          .eq("tenant_id", tenant_id)
          .order("created_at", { ascending: false })
          .limit(1);
        if (accts && accts.length > 0) {
          const acct = accts[0] as any;
          accountNumber = acct.account_number || "";
          const e = acct.entities;
          entityAccountName = e ? [e.name, e.last_name].filter(Boolean).join(" ") : "";
        }
      }
    }

    // Resolve tenant legal entity bank details
    let legalEntityBankDetails = "";
    if (tenantConfig?.legal_entity_id) {
      const { data: bankRows } = await adminClient
        .from("entity_bank_details")
        .select("account_holder, account_number, bank_id, banks!entity_bank_details_bank_id_fkey(name, branch_code)")
        .eq("entity_id", tenantConfig.legal_entity_id)
        .eq("is_active", true)
        .eq("is_deleted", false)
        .limit(1);
      if (bankRows && bankRows.length > 0) {
        const b = bankRows[0] as any;
        const bankName = b.banks?.name || "";
        const branchCode = b.banks?.branch_code || "";
        legalEntityBankDetails = [
          bankName ? `Bank: ${bankName}` : "",
          branchCode ? `Branch Code: ${branchCode}` : "",
          b.account_holder ? `Account Holder: ${b.account_holder}` : "",
          b.account_number ? `Account Number: ${b.account_number}` : "",
        ].filter(Boolean).join(", ");
      }
    }

    const userLang = profile.language_code || "en";
    const { data: template } = await adminClient
      .from("communication_templates")
      .select("subject, body_html")
      .eq("tenant_id", tenant_id)
      .eq("application_event", "account_creation_successful")
      .eq("is_active", true)
      .eq("is_email_active", true)
      .eq("language_code", userLang)
      .maybeSingle();

    const firstName = profile.first_name || "Member";

    // Resolve tenant display name: prefer legal entity name over tenant.name
    let tenantName = tenant?.name || "the cooperative";
    if (tenantConfig?.legal_entity_id) {
      const { data: legalEntity } = await adminClient
        .from("entities")
        .select("name")
        .eq("id", tenantConfig.legal_entity_id)
        .single();
      if (legalEntity?.name) tenantName = legalEntity.name;
    }

    // Resolve email signature
    const emailSignature = userLang === "af"
      ? (tenantConfig as any)?.email_signature_af || (tenantConfig as any)?.email_signature_en || ""
      : (tenantConfig as any)?.email_signature_en || "";

    let subject = template?.subject || `Welcome to ${tenantName} – Membership Application Received!`;
    let body = template?.body_html ||
      `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <h2 style="color:#1a1a2e;">Membership Application Received!</h2>
        <p>Dear ${firstName},</p>
        <p>Thank you for applying for membership with <strong>${tenantName}</strong>.</p>
        <p>Your application has been received and is pending activation. Your membership account will be activated once your first deposit is received.</p>
        <p>You will receive a confirmation once your account is fully active.</p>
        <br/>
        <p>Best regards,<br/><strong>${tenantName}</strong></p>
      </div>`;

    const replacements: Record<string, string> = {
      "{{entity_name}}": [profile.first_name, profile.last_name].filter(Boolean).join(" ") || firstName,
      "{{user_name}}": firstName,
      "{{user_surname}}": profile.last_name || "",
      "{{first_name}}": [profile.first_name, profile.last_name].filter(Boolean).join(" ") || firstName,
      "{{last_name}}": "",
      "{{tenant_name}}": tenantName,
      "{{legal_entity_name}}": tenantName,
      "{{email}}": profile.email,
      "{{email_address}}": profile.email,
      "{{entity_account_name}}": entityAccountName,
      "{{account_number}}": accountNumber,
      "{{entity_account_bank_details}}": legalEntityBankDetails,
      "{{Tenant.LegalEntityBankDetails}}": legalEntityBankDetails,
      "{{email_signature}}": emailSignature,
    };
    for (const [key, val] of Object.entries(replacements)) {
      subject = subject.replaceAll(key, val);
      body = body.replaceAll(key, val);
    }

    // Determine SMTP: tenant config → head office → AEM source tenant
    let smtpHost = tenantConfig?.smtp_host || null;
    let smtpPort = tenantConfig?.smtp_port || null;
    let smtpUsername = tenantConfig?.smtp_username || null;
    let smtpPassword = tenantConfig?.smtp_password || null;
    let smtpFromEmail = tenantConfig?.smtp_from_email || null;
    let smtpFromName = tenantConfig?.smtp_from_name || null;

    if (!smtpHost || !smtpFromEmail) {
      console.log("[send-account-creation-email] Tenant SMTP not configured, falling back to head office");
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
        console.log("[send-account-creation-email] Using head office SMTP settings from DB");
      } else {
        // Fallback to GLOBAL_SMTP_* environment secrets
        const envHost = Deno.env.get("GLOBAL_SMTP_HOST");
        const envUsername = Deno.env.get("GLOBAL_SMTP_USERNAME");
        if (envHost && envUsername) {
          smtpHost = envHost;
          smtpPort = parseInt(Deno.env.get("GLOBAL_SMTP_PORT") || "587", 10);
          smtpUsername = envUsername;
          smtpPassword = Deno.env.get("GLOBAL_SMTP_PASSWORD") || "";
          smtpFromEmail = envUsername;
          smtpFromName = Deno.env.get("GLOBAL_SMTP_FROM_NAME") || hoSettings?.company_name || "My Co-op";
          console.log("[send-account-creation-email] Using GLOBAL_SMTP_* env secrets");
        } else {
          console.warn("[send-account-creation-email] No SMTP configured in tenant, head office DB, or env secrets");
        }
      }
    }

    // Send via SMTP
    let emailSent = false;
    let messageId = "";
    let smtpError = "";

    if (smtpHost && smtpFromEmail) {
      try {
        const { default: nodemailer } = await import("npm:nodemailer@6.9.10");
        const requestedPort = smtpPort || 587;
        const usePort = requestedPort === 465 ? 587 : requestedPort;
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: usePort,
          secure: false,
          ignoreTLS: true,
          auth: smtpUsername ? { user: smtpUsername, pass: smtpPassword || "" } : undefined,
        });

        const isSmtpUserEmail = smtpUsername?.includes("@");
        const effectiveFromEmail = isSmtpUserEmail ? smtpUsername : smtpFromEmail;
        const fromHeader = smtpFromName
          ? `"${smtpFromName}" <${effectiveFromEmail}>`
          : effectiveFromEmail;

        const info = await transporter.sendMail({ from: fromHeader, to: profile.email, subject, html: body });
        emailSent = true;
        messageId = info.messageId;
        console.log(`[send-account-creation-email] Sent: ${messageId} to ${profile.email}`);
      } catch (err: any) {
        smtpError = err.message;
        console.error(`[send-account-creation-email] SMTP error: ${smtpError}`);
      }
    } else {
      smtpError = "SMTP not configured for this tenant or head office";
      console.warn(`[send-account-creation-email] ${smtpError}`);
    }

    return new Response(
      JSON.stringify({ success: true, email_sent: emailSent, message_id: messageId || undefined, smtp_error: smtpError || undefined, recipient: profile.email, subject }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
