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

    const { tenant_id } = await req.json();
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
      "{{email}}": profile.email,
    };
    for (const [key, val] of Object.entries(replacements)) {
      subject = subject.replaceAll(key, val);
      body = body.replaceAll(key, val);
    }

    // Append tenant email signature
    const emailSignature = userLang === "af"
      ? (tenantConfig as any)?.email_signature_af || (tenantConfig as any)?.email_signature_en || ""
      : (tenantConfig as any)?.email_signature_en || "";
    if (emailSignature) {
      body = body + emailSignature;
    }

    // Send via tenant SMTP
    let emailSent = false;
    let messageId = "";
    let smtpError = "";

    if (tenantConfig?.smtp_host && tenantConfig?.smtp_from_email) {
      try {
        const { default: nodemailer } = await import("npm:nodemailer@6.9.10");
        const requestedPort = tenantConfig.smtp_port || 587;
        const usePort = requestedPort === 465 ? 587 : requestedPort;
        const transporter = nodemailer.createTransport({
          host: tenantConfig.smtp_host,
          port: usePort,
          secure: false,
          ignoreTLS: true,
          auth: tenantConfig.smtp_username ? { user: tenantConfig.smtp_username, pass: tenantConfig.smtp_password || "" } : undefined,
        });

        const isSmtpUserEmail = tenantConfig.smtp_username?.includes("@");
        const effectiveFromEmail = isSmtpUserEmail ? tenantConfig.smtp_username : tenantConfig.smtp_from_email;
        const fromHeader = tenantConfig.smtp_from_name
          ? `"${tenantConfig.smtp_from_name}" <${effectiveFromEmail}>`
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
      smtpError = "SMTP not configured for this tenant";
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
