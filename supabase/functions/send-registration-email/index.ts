import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.10";

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
    const token = authHeader.replace("Bearer ", "");

    const body = await req.json();
    const { tenant_id, user_id: explicitUserId } = body;
    if (!tenant_id) {
      return new Response(JSON.stringify({ error: "tenant_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let userId: string;

    // If service role key is used and explicit user_id provided, allow admin resend
    if (token === supabaseServiceKey && explicitUserId) {
      userId = explicitUserId;
      console.log("[send-registration-email] Admin resend for user:", userId);
    } else {
      // Verify the calling user via JWT
      const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: claimsData, error: claimsErr } = await anonClient.auth.getClaims(token);
      if (claimsErr || !claimsData?.claims) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = claimsData.claims.sub as string;
    }

    // Use service role to fetch data
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch user profile
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

    // Fetch tenant info
    const { data: tenant } = await adminClient
      .from("tenants")
      .select("name")
      .eq("id", tenant_id)
      .single();

    // Fetch tenant SMTP configuration from tenant_configuration
    const { data: tenantConfig } = await adminClient
      .from("tenant_configuration")
      .select("smtp_host, smtp_port, smtp_username, smtp_password, smtp_from_email, smtp_from_name, smtp_enable_ssl, email_signature_en, email_signature_af, legal_entity_id")
      .eq("tenant_id", tenant_id)
      .maybeSingle();

    // Fetch communication template for this event in user's preferred language
    const userLang = profile.language_code || "en";
    const { data: template } = await adminClient
      .from("communication_templates")
      .select("subject, body_html")
      .eq("tenant_id", tenant_id)
      .eq("application_event", "user_registration_completed")
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

    // Use template if available, otherwise use a default
    let subject = template?.subject || `Welcome to ${tenantName} – Registration Complete!`;
    let body = template?.body_html ||
      `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <h2 style="color:#1a1a2e;">Registration Complete!</h2>
        <p>Dear ${firstName},</p>
        <p>Congratulations! Your registration with <strong>${tenantName}</strong> has been successfully completed.</p>
        <p>You now have full access to all features. Log in to your dashboard to get started.</p>
        <br/>
        <p>Best regards,<br/><strong>${tenantName}</strong></p>
      </div>`;

    // Replace placeholders
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

    // Determine SMTP config: use tenant's own, or fall back to head_office_settings
    let smtpHost = tenantConfig?.smtp_host;
    let smtpPort = tenantConfig?.smtp_port;
    let smtpUsername = tenantConfig?.smtp_username;
    let smtpPassword = tenantConfig?.smtp_password;
    let smtpFromEmail = tenantConfig?.smtp_from_email;
    let smtpFromName = tenantConfig?.smtp_from_name;

    if (!smtpHost || !smtpFromEmail) {
      console.log("[send-registration-email] Tenant SMTP not configured, falling back to head office settings");
      // First try head_office_settings table
      const { data: hoSettings } = await adminClient
        .from("head_office_settings")
        .select("smtp_host, smtp_port, smtp_username, smtp_password, smtp_from_email, smtp_from_name, smtp_enable_ssl, company_name")
        .limit(1)
        .maybeSingle();

      if (hoSettings?.smtp_host && hoSettings?.smtp_from_email) {
        smtpHost = hoSettings.smtp_host;
        smtpPort = hoSettings.smtp_port;
        smtpUsername = hoSettings.smtp_username;
        smtpPassword = hoSettings.smtp_password;
        smtpFromEmail = hoSettings.smtp_from_email;
        smtpFromName = hoSettings.smtp_from_name || hoSettings.company_name;
        console.log("[send-registration-email] Using head office SMTP settings");
      } else {
        // Fallback: use the AEM source tenant's SMTP config
        const { data: sourceTenantConfig } = await adminClient
          .from("tenant_configuration")
          .select("smtp_host, smtp_port, smtp_username, smtp_password, smtp_from_email, smtp_from_name")
          .eq("tenant_id", "38e204c4-829f-4544-ab53-b2f3f5342662")
          .maybeSingle();

        if (sourceTenantConfig?.smtp_host && sourceTenantConfig?.smtp_from_email) {
          smtpHost = sourceTenantConfig.smtp_host;
          smtpPort = sourceTenantConfig.smtp_port;
          smtpUsername = sourceTenantConfig.smtp_username;
          smtpPassword = sourceTenantConfig.smtp_password;
          smtpFromEmail = sourceTenantConfig.smtp_from_email;
          smtpFromName = sourceTenantConfig.smtp_from_name;
          console.log("[send-registration-email] Using AEM source tenant SMTP as fallback");
        }
      }
    }

    // Send via SMTP
    let emailSent = false;
    let messageId = "";
    let smtpError = "";

    if (smtpHost && smtpFromEmail) {
      try {
        const requestedPort = smtpPort || 587;
        const usePort = requestedPort === 465 ? 587 : requestedPort;

        console.log(`[send-registration-email] Sending via ${smtpHost}:${usePort} to ${profile.email}`);

        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: usePort,
          secure: false,
          ignoreTLS: true,
          auth: smtpUsername ? {
            user: smtpUsername,
            pass: smtpPassword || "",
          } : undefined,
        });

        const isSmtpUserEmail = smtpUsername?.includes("@");
        const effectiveFromEmail = isSmtpUserEmail ? smtpUsername : smtpFromEmail;
        const fromHeader = smtpFromName
          ? `"${smtpFromName}" <${effectiveFromEmail}>`
          : effectiveFromEmail;

        const info = await transporter.sendMail({
          from: fromHeader,
          to: profile.email,
          subject,
          html: body,
        });

        emailSent = true;
        messageId = info.messageId;
        console.log(`[send-registration-email] Email sent: ${messageId}`);
      } catch (smtpErr: any) {
        smtpError = smtpErr.message;
        console.error(`[send-registration-email] SMTP error: ${smtpError}`);
      }
    } else {
      smtpError = "SMTP not configured for this tenant or head office";
      console.warn(`[send-registration-email] ${smtpError}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        email_sent: emailSent,
        message_id: messageId || undefined,
        smtp_error: smtpError || undefined,
        recipient: profile.email,
        subject,
      }),
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
