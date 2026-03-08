import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.10";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Fetch global SMTP settings from system_settings table */
async function getGlobalSmtp(adminClient: any) {
  const keys = [
    "GLOBAL_SMTP_HOST",
    "GLOBAL_SMTP_PORT",
    "GLOBAL_SMTP_USERNAME",
    "GLOBAL_SMTP_PASSWORD",
    "GLOBAL_SMTP_FROM_EMAIL",
    "GLOBAL_SMTP_FROM_NAME",
  ];
  const { data } = await adminClient
    .from("system_settings")
    .select("key, value")
    .in("key", keys);

  const map: Record<string, string> = {};
  for (const row of data || []) map[row.key] = row.value ?? "";

  return {
    host: map["GLOBAL_SMTP_HOST"] || "",
    port: parseInt(map["GLOBAL_SMTP_PORT"] || "587", 10),
    username: map["GLOBAL_SMTP_USERNAME"] || "",
    password: map["GLOBAL_SMTP_PASSWORD"] || "",
    fromEmail: map["GLOBAL_SMTP_FROM_EMAIL"] || "",
    fromName: map["GLOBAL_SMTP_FROM_NAME"] || "",
  };
}

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
    const userId = claimsData.claims.sub as string;

    const { tenant_id } = await req.json();
    if (!tenant_id) {
      return new Response(JSON.stringify({ error: "tenant_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

    // Fetch global SMTP configuration from system_settings
    const smtp = await getGlobalSmtp(adminClient);

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
    {
      const { data: tenantCfg } = await adminClient
        .from("tenant_configuration")
        .select("legal_entity_id")
        .eq("tenant_id", tenant_id)
        .maybeSingle();
      if (tenantCfg?.legal_entity_id) {
        const { data: legalEntity } = await adminClient
          .from("entities")
          .select("name")
          .eq("id", tenantCfg.legal_entity_id)
          .single();
        if (legalEntity?.name) tenantName = legalEntity.name;
      }
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

    // Fetch and append tenant email signature
    const { data: tenantConfig } = await adminClient
      .from("tenant_configuration")
      .select("email_signature_en, email_signature_af")
      .eq("tenant_id", tenant_id)
      .maybeSingle();

    const emailSignature = userLang === "af"
      ? (tenantConfig as any)?.email_signature_af || (tenantConfig as any)?.email_signature_en || ""
      : (tenantConfig as any)?.email_signature_en || "";
    if (emailSignature) {
      body = body + emailSignature;
    }

    // Try to send via global SMTP
    let emailSent = false;
    let messageId = "";
    let smtpError = "";

    if (smtp.host && smtp.fromEmail) {
      try {
        const usePort = smtp.port === 465 ? 587 : smtp.port;

        console.log(`[send-registration-email] Sending via ${smtp.host}:${usePort} to ${profile.email}`);

        const transporter = nodemailer.createTransport({
          host: smtp.host,
          port: usePort,
          secure: false,
          tls: { rejectUnauthorized: false },
          auth: smtp.username ? {
            user: smtp.username,
            pass: smtp.password,
          } : undefined,
        });

        const fromHeader = smtp.fromName
          ? `"${smtp.fromName}" <${smtp.fromEmail}>`
          : smtp.fromEmail;

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
      smtpError = "Global SMTP not configured in system settings";
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
