import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  resolveSmtp,
  createSmtpTransporter,
  buildFromHeader,
  resolveTenantDisplayName,
  resolveEmailSignature,
} from "../_shared/email-helpers.ts";

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

    // Determine tenant_id if not provided
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
      return new Response(JSON.stringify({ success: true, email_sent: false, smtp_error: "No tenant found" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch tenant config
    const { data: tenantConfig } = await adminClient
      .from("tenant_configuration")
      .select("smtp_host, smtp_port, smtp_username, smtp_password, smtp_from_email, smtp_from_name, smtp_enable_ssl, email_signature_en, email_signature_af, legal_entity_id, use_global_email_settings")
      .eq("tenant_id", resolvedTenantId)
      .maybeSingle();

    const tenantName = await resolveTenantDisplayName(adminClient, resolvedTenantId, tenantConfig);
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
      day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
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

    const emailSignature = resolveEmailSignature(tenantConfig, userLang);
    if (emailSignature) {
      body = body + emailSignature;
    }

    // ── Resolve SMTP using standard 3-tier fallback ──
    const smtp = await resolveSmtp(adminClient, resolvedTenantId, tenantConfig);

    let emailSent = false;
    let messageId = "";
    let smtpError = "";

    if (smtp) {
      const transporter = await createSmtpTransporter(smtp);
      if (transporter) {
        try {
          const info = await transporter.sendMail({
            from: buildFromHeader(smtp),
            replyTo: smtp.username?.includes("@") ? smtp.username : undefined,
            to: profile.email,
            subject,
            html: body,
          });
          emailSent = true;
          messageId = info.messageId;
          console.log(`[send-password-reset-confirmation] Sent: ${messageId} (SMTP source: ${smtp.source})`);
        } catch (err: any) {
          smtpError = err.message;
          console.error(`[send-password-reset-confirmation] SMTP error: ${smtpError}`);
        }
      } else {
        smtpError = "All SMTP connection strategies failed";
      }
    } else {
      smtpError = "No SMTP configured (tenant, head office, or env)";
    }

    return new Response(
      JSON.stringify({ success: true, email_sent: emailSent, message_id: messageId || undefined, smtp_error: smtpError || undefined, smtp_source: smtp?.source || "none" }),
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
