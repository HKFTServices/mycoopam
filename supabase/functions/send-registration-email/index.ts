import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.10";

const PROD_DOMAIN = "myco-op.co.za";

function getTenantSiteUrl(tenantSlug?: string | null) {
  if (tenantSlug) {
    return `https://${tenantSlug}.${PROD_DOMAIN}`;
  }

  return `https://www.${PROD_DOMAIN}`;
}

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
    const apiKeyHeader = req.headers.get("apikey") || "";
    if (!authHeader?.startsWith("Bearer ") && !apiKeyHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const token = authHeader ? authHeader.replace("Bearer ", "") : "";
    const isServiceRole = token === supabaseServiceKey || apiKeyHeader === supabaseServiceKey;

    const reqBody = await req.json();
    const { tenant_id, user_id: explicitUserId } = reqBody;
    if (!tenant_id) {
      return new Response(JSON.stringify({ error: "tenant_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let userId: string;

    // If service role key is used and explicit user_id provided, allow admin resend
    if (isServiceRole && explicitUserId) {
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
      const callerUserId = claimsData.claims.sub as string;

      // If explicit user_id provided, check caller is super_admin
      if (explicitUserId) {
        const adminClient2 = createClient(supabaseUrl, supabaseServiceKey);
        const { data: roleCheck } = await adminClient2
          .from("user_roles")
          .select("role")
          .eq("user_id", callerUserId)
          .eq("role", "super_admin")
          .maybeSingle();
        if (!roleCheck) {
          return new Response(JSON.stringify({ error: "Forbidden: super_admin required" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        userId = explicitUserId;
        console.log("[send-registration-email] Super admin resend for user:", userId);
      } else {
        userId = callerUserId;
      }
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
      .select("name, slug")
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

    const redirectTo = getTenantSiteUrl(tenant?.slug);
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "signup",
      email: profile.email,
      options: {
        redirectTo,
      },
    });

    if (linkError || !linkData?.properties?.action_link) {
      throw new Error(linkError?.message || "Failed to generate activation link");
    }

    const activationLink = linkData.properties.action_link;

    // Use template if available, otherwise use a default
    let subject = template?.subject || `Activate your ${tenantName} account`;
    let body = template?.body_html ||
      `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#ffffff;">
        <h2 style="color:#1a1a2e;">Activate your account</h2>
        <p>Dear ${firstName},</p>
        <p>Your administrator account for <strong>${tenantName}</strong> has been created.</p>
        <p>Please click the button below to verify your email address and activate your access.</p>
        <div style="margin:32px 0;text-align:center;">
          <a href="{{activation_link}}" style="display:inline-block;background:#1a1a2e;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;">Activate account</a>
        </div>
        <p style="font-size:13px;color:#666;">If the button does not work, copy and paste this link into your browser:</p>
        <p style="font-size:13px;word-break:break-all;color:#1a1a2e;">{{activation_link}}</p>
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
      "{{activation_link}}": activationLink,
      "{{confirmation_link}}": activationLink,
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

    await adminClient.from("email_logs").insert({
      application_event: "user_registration_completed",
      recipient_email: profile.email,
      recipient_user_id: userId,
      status: emailSent ? "sent" : "failed",
      subject,
      error_message: smtpError || null,
      tenant_id,
      metadata: {
        message_id: messageId || null,
        email_type: "activation",
        redirect_to: redirectTo,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        email_sent: emailSent,
        message_id: messageId || undefined,
        smtp_error: smtpError || undefined,
        recipient: profile.email,
        subject,
        activation_link_generated: true,
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
