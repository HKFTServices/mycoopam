import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  resolveSmtp,
  createSmtpTransporter,
  buildFromHeader,
  buildTenantUrl,
  resolveTenantDisplayName,
  resolveEmailSignature,
} from "../_shared/email-helpers.ts";

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
    let tenantSlug: string | null = tenant_slug || null;

    if (tenant_slug) {
      const { data: tenant } = await adminClient
        .from("tenants")
        .select("id, name, slug")
        .eq("slug", tenant_slug)
        .eq("is_active", true)
        .single();
      if (tenant) {
        tenantId = tenant.id;
        tenantSlug = tenant.slug;
      }
    }

    // If no slug, try to find tenant from user's membership
    if (!tenantId) {
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
          // Fetch slug for URL building
          const { data: tenant } = await adminClient
            .from("tenants")
            .select("name, slug")
            .eq("id", tenantId)
            .single();
          if (tenant) tenantSlug = tenant.slug;
        }
      }
    }

    if (!tenantId) {
      console.warn("[send-password-reset] No tenant found, falling back to default");
      return new Response(JSON.stringify({ success: true, fallback: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch tenant config for branding + SMTP
    const { data: tenantConfig } = await adminClient
      .from("tenant_configuration")
      .select("smtp_host, smtp_port, smtp_username, smtp_password, smtp_from_email, smtp_from_name, smtp_enable_ssl, email_signature_en, email_signature_af, legal_entity_id")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    const tenantName = await resolveTenantDisplayName(adminClient, tenantId, tenantConfig);

    // ── Resolve SMTP using standard 3-tier fallback ──
    const smtp = await resolveSmtp(adminClient, tenantId, tenantConfig);
    if (!smtp) {
      console.warn("[send-password-reset] No SMTP configured anywhere, falling back");
      return new Response(JSON.stringify({ success: true, fallback: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build the correct tenant-specific reset URL
    const resetRedirectUrl = redirect_url || buildTenantUrl(tenantSlug, "/reset-password");

    // Generate the password reset link via admin API
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: resetRedirectUrl },
    });

    if (linkError || !linkData) {
      console.error("[send-password-reset] generateLink error:", linkError);
      return new Response(JSON.stringify({ error: linkError?.message || "Failed to generate reset link" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    // Append email signature
    const emailSignature = resolveEmailSignature(tenantConfig, userLang);
    if (emailSignature) {
      body = body + emailSignature;
    }

    // ── Send via SMTP ──
    const transporter = await createSmtpTransporter(smtp);
    if (!transporter) {
      return new Response(JSON.stringify({ error: "SMTP connection failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const info = await transporter.sendMail({
      from: buildFromHeader(smtp),
      to: email,
      subject,
      html: body,
    });

    console.log(`[send-password-reset] Sent: ${info.messageId} to ${email} (SMTP source: ${smtp.source})`);

    return new Response(
      JSON.stringify({ success: true, email_sent: true, message_id: info.messageId, smtp_source: smtp.source }),
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
