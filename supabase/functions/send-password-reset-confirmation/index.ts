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

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch user profile
    const { data: profile } = await adminClient
      .from("profiles")
      .select("first_name, last_name, email, language_code")
      .eq("user_id", userId)
      .single();

    if (!profile?.email) {
      return new Response(JSON.stringify({ error: "User profile not found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine tenant_id if not provided - find from user's tenant membership
    let resolvedTenantId = tenant_id;
    if (!resolvedTenantId) {
      const { data: membership } = await adminClient
        .from("tenant_memberships")
        .select("tenant_id")
        .eq("user_id", userId)
        .eq("is_active", true)
        .limit(1)
        .single();
      resolvedTenantId = membership?.tenant_id;
    }

    if (!resolvedTenantId) {
      console.warn("[send-password-reset-confirmation] No tenant found for user");
      return new Response(JSON.stringify({ success: true, email_sent: false, smtp_error: "No tenant found" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch tenant SMTP configuration
    const { data: tenantConfig } = await adminClient
      .from("tenant_configuration")
      .select("smtp_host, smtp_port, smtp_username, smtp_password, smtp_from_email, smtp_from_name, smtp_enable_ssl, email_signature_en, email_signature_af, legal_entity_id")
      .eq("tenant_id", resolvedTenantId)
      .maybeSingle();

    // Resolve tenant display name
    let tenantName = "the cooperative";
    if (tenantConfig?.legal_entity_id) {
      const { data: legalEntity } = await adminClient
        .from("entities")
        .select("name")
        .eq("id", tenantConfig.legal_entity_id)
        .single();
      if (legalEntity?.name) tenantName = legalEntity.name;
    } else {
      const { data: tenant } = await adminClient
        .from("tenants")
        .select("name")
        .eq("id", resolvedTenantId)
        .single();
      if (tenant?.name) tenantName = tenant.name;
    }

    const firstName = profile.first_name || "Member";
    const userLang = profile.language_code || "en";

    // Check for custom template
    const { data: template } = await adminClient
      .from("communication_templates")
      .select("subject, body_html")
      .eq("tenant_id", resolvedTenantId)
      .eq("application_event", "password_reset_successful")
      .eq("is_active", true)
      .eq("is_email_active", true)
      .eq("language_code", userLang)
      .maybeSingle();

    const nowDate = new Date().toLocaleDateString("en-ZA", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    let subject = template?.subject || `Password Reset Successful – ${tenantName}`;
    let body = template?.body_html ||
      `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <h2 style="color:#1e3a5f;">Password Reset Successful</h2>
        <p>Dear ${firstName},</p>
        <p>Your password for <strong>${tenantName}</strong> has been successfully reset on <strong>${nowDate}</strong>.</p>
        <p>If you did not make this change, please contact your administrator immediately.</p>
        <br/>
        <p>Best regards,<br/><strong>${tenantName}</strong></p>
      </div>`;

    // Replace placeholders
    const replacements: Record<string, string> = {
      "{{entity_name}}": [profile.first_name, profile.last_name].filter(Boolean).join(" ") || firstName,
      "{{user_name}}": firstName,
      "{{first_name}}": [profile.first_name, profile.last_name].filter(Boolean).join(" ") || firstName,
      "{{tenant_name}}": tenantName,
      "{{email}}": profile.email,
      "{{date}}": nowDate,
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
        const smtpStrategies = [
          { port: 465, secure: true,  ignoreTLS: false },
          { port: 587, secure: false, ignoreTLS: false },
          { port: 587, secure: false, ignoreTLS: true  },
          { port: 25,  secure: false, ignoreTLS: true  },
        ];
        let transporter: any = null;
        for (const s of smtpStrategies) {
          try {
            const t = nodemailer.createTransport({
              host: tenantConfig.smtp_host, port: s.port, secure: s.secure, ignoreTLS: s.ignoreTLS,
              tls: { rejectUnauthorized: false },
              auth: tenantConfig.smtp_username ? { user: tenantConfig.smtp_username, pass: tenantConfig.smtp_password || "" } : undefined,
            });
            await t.verify();
            transporter = t;
            break;
          } catch (err: any) {
            if (/534|535/.test(err.message)) break;
          }
        }
        if (!transporter) throw new Error("All SMTP strategies failed");

        const fromEmail = tenantConfig.smtp_from_email;
        const fromHeader = tenantConfig.smtp_from_name
          ? `"${tenantConfig.smtp_from_name}" <${fromEmail}>`
          : fromEmail;

        const info = await transporter.sendMail({
          from: fromHeader,
          replyTo: tenantConfig.smtp_username?.includes("@") ? tenantConfig.smtp_username : undefined,
          to: profile.email,
          subject,
          html: body,
        });

        emailSent = true;
        messageId = info.messageId;
        console.log(`[send-password-reset-confirmation] Sent: ${messageId} to ${profile.email}`);
      } catch (err: any) {
        smtpError = err.message;
        console.error(`[send-password-reset-confirmation] SMTP error: ${smtpError}`);
      }
    } else {
      smtpError = "SMTP not configured for this tenant";
      console.warn(`[send-password-reset-confirmation] ${smtpError}`);
    }

    return new Response(
      JSON.stringify({ success: true, email_sent: emailSent, message_id: messageId || undefined, smtp_error: smtpError || undefined }),
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
