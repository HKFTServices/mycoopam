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
    const { email, tenant_slug, redirect_url } = await req.json();
    if (!email) {
      return new Response(JSON.stringify({ error: "email is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Resolve tenant from slug
    let tenantId: string | null = null;
    let tenantName = "the cooperative";

    if (tenant_slug) {
      const { data: tenant } = await adminClient
        .from("tenants")
        .select("id, name")
        .eq("slug", tenant_slug)
        .eq("is_active", true)
        .single();
      if (tenant) {
        tenantId = tenant.id;
        tenantName = tenant.name;
      }
    }

    // If no slug, try to find tenant from user's membership
    if (!tenantId) {
      // First find the user
      const { data: userList } = await adminClient.auth.admin.listUsers();
      const user = userList?.users?.find((u: any) => u.email === email);
      if (user) {
        const { data: membership } = await adminClient
          .from("tenant_memberships")
          .select("tenant_id")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .limit(1)
          .single();
        if (membership) {
          tenantId = membership.tenant_id;
          const { data: tenant } = await adminClient
            .from("tenants")
            .select("name")
            .eq("id", tenantId)
            .single();
          if (tenant) tenantName = tenant.name;
        }
      }
    }

    if (!tenantId) {
      // Still send via default Supabase auth (fallback)
      console.warn("[send-password-reset] No tenant found, falling back to default");
      return new Response(JSON.stringify({ success: true, fallback: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch tenant config for SMTP and branding
    const { data: tenantConfig } = await adminClient
      .from("tenant_configuration")
      .select("smtp_host, smtp_port, smtp_username, smtp_password, smtp_from_email, smtp_from_name, smtp_enable_ssl, email_signature_en, email_signature_af, legal_entity_id")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    // Resolve display name from legal entity
    if (tenantConfig?.legal_entity_id) {
      const { data: legalEntity } = await adminClient
        .from("entities")
        .select("name")
        .eq("id", tenantConfig.legal_entity_id)
        .single();
      if (legalEntity?.name) tenantName = legalEntity.name;
    }

    if (!tenantConfig?.smtp_host || !tenantConfig?.smtp_from_email) {
      console.warn("[send-password-reset] No SMTP configured for tenant, falling back");
      return new Response(JSON.stringify({ success: true, fallback: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate the password reset link via admin API
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo: redirect_url || `https://www.myco-op.co.za/reset-password`,
      },
    });

    if (linkError || !linkData) {
      console.error("[send-password-reset] generateLink error:", linkError);
      return new Response(JSON.stringify({ error: linkError?.message || "Failed to generate reset link" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // The generated link contains the token - extract and rebuild for correct domain
    const actionLink = linkData.properties?.action_link;
    if (!actionLink) {
      return new Response(JSON.stringify({ error: "No action link generated" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch user profile for personalization
    const userId = linkData.user?.id;
    let firstName = "Member";
    let userLang = "en";
    if (userId) {
      const { data: profile } = await adminClient
        .from("profiles")
        .select("first_name, language_code")
        .eq("user_id", userId)
        .single();
      if (profile?.first_name) firstName = profile.first_name;
      if (profile?.language_code) userLang = profile.language_code;
    }

    // Check for custom template
    const { data: template } = await adminClient
      .from("communication_templates")
      .select("subject, body_html")
      .eq("tenant_id", tenantId)
      .eq("application_event", "password_reset_request")
      .eq("is_active", true)
      .eq("is_email_active", true)
      .eq("language_code", userLang)
      .maybeSingle();

    let subject = template?.subject || `Password Reset Request – ${tenantName}`;
    let body = template?.body_html ||
      `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#ffffff;">
        <h2 style="color:#1e3a5f;margin-bottom:16px;">Password Reset Request</h2>
        <p style="color:#333;font-size:15px;">Dear {{first_name}},</p>
        <p style="color:#333;font-size:15px;">We received a request to reset your password for your <strong>{{tenant_name}}</strong> account.</p>
        <p style="color:#333;font-size:15px;">Click the button below to set a new password:</p>
        <div style="text-align:center;margin:32px 0;">
          <a href="{{reset_link}}" style="display:inline-block;background-color:#1e3a5f;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:6px;font-size:16px;font-weight:600;">Reset Password</a>
        </div>
        <p style="color:#666;font-size:13px;">If the button doesn't work, copy and paste this link into your browser:</p>
        <p style="color:#1e3a5f;font-size:13px;word-break:break-all;">{{reset_link}}</p>
        <hr style="border:none;border-top:1px solid #e0e0e0;margin:24px 0;"/>
        <p style="color:#999;font-size:12px;">If you did not request a password reset, please ignore this email. Your password will remain unchanged.</p>
        <br/>
        <p style="color:#333;font-size:14px;">Best regards,<br/><strong>{{tenant_name}}</strong></p>
      </div>`;

    // Replace placeholders
    const replacements: Record<string, string> = {
      "{{first_name}}": firstName,
      "{{user_name}}": firstName,
      "{{entity_name}}": firstName,
      "{{tenant_name}}": tenantName,
      "{{email}}": email,
      "{{reset_link}}": actionLink,
    };
    for (const [key, val] of Object.entries(replacements)) {
      subject = subject.replaceAll(key, val);
      body = body.replaceAll(key, val);
    }

    // Append tenant email signature
    const emailSignature = userLang === "af"
      ? tenantConfig.email_signature_af || tenantConfig.email_signature_en || ""
      : tenantConfig.email_signature_en || "";
    if (emailSignature) {
      body = body + emailSignature;
    }

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
    if (!transporter) {
      return new Response(JSON.stringify({ error: "SMTP connection failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fromEmail = tenantConfig.smtp_from_email;
    const fromHeader = tenantConfig.smtp_from_name
      ? `"${tenantConfig.smtp_from_name}" <${fromEmail}>`
      : fromEmail;

    const info = await transporter.sendMail({
      from: fromHeader,
      replyTo: tenantConfig.smtp_username?.includes("@") ? tenantConfig.smtp_username : undefined,
      to: email,
      subject,
      html: body,
    });

    console.log(`[send-password-reset] Sent: ${info.messageId} to ${email}`);

    return new Response(
      JSON.stringify({ success: true, email_sent: true, message_id: info.messageId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[send-password-reset] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
