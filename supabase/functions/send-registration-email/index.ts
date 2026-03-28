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
    const authHeader = req.headers.get("Authorization");
    const apiKeyHeader = req.headers.get("apikey") || "";

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const token = authHeader ? authHeader.replace("Bearer ", "") : "";
    const isServiceRole = token === supabaseServiceKey || apiKeyHeader === supabaseServiceKey;

    const reqBody = await req.json();
    const { tenant_id, user_id: explicitUserId, self_register_email } = reqBody;
    if (!tenant_id) {
      return new Response(JSON.stringify({ error: "tenant_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let userId: string;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // ── Self-registration mode: unauthenticated call right after signUp ──
    if (self_register_email && typeof self_register_email === "string") {
      console.log("[send-registration-email] Self-register mode for:", self_register_email);
      const { data: profileMatch } = await adminClient
        .from("profiles")
        .select("user_id, created_at")
        .eq("email", self_register_email)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!profileMatch) {
        return new Response(JSON.stringify({ error: "User not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const createdAt = new Date(profileMatch.created_at);
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
      if (createdAt < fiveMinAgo) {
        return new Response(JSON.stringify({ error: "Registration window expired" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = profileMatch.user_id;
    } else if (!authHeader?.startsWith("Bearer ") && !apiKeyHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else if (isServiceRole && explicitUserId) {
      userId = explicitUserId;
      console.log("[send-registration-email] Admin resend for user:", userId);
    } else {
      const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: userData, error: userErr } = await anonClient.auth.getUser();
      if (userErr || !userData?.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const callerUserId = userData.user.id;

      if (explicitUserId) {
        const { data: roleCheck } = await adminClient
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
      } else {
        userId = callerUserId;
      }
    }

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

    // Fetch tenant info (need slug for URL building)
    const { data: tenant } = await adminClient
      .from("tenants")
      .select("name, slug")
      .eq("id", tenant_id)
      .single();

    // Fetch tenant config
    const { data: tenantConfig } = await adminClient
      .from("tenant_configuration")
      .select("smtp_host, smtp_port, smtp_username, smtp_password, smtp_from_email, smtp_from_name, smtp_enable_ssl, email_signature_en, email_signature_af, legal_entity_id")
      .eq("tenant_id", tenant_id)
      .maybeSingle();

    // Fetch communication template
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
    const tenantName = await resolveTenantDisplayName(adminClient, tenant_id, tenantConfig);

    // Build redirect URL using tenant slug → correct subdomain
    const redirectTo = buildTenantUrl(tenant?.slug, "/auth");

    // Generate activation link
    let activationLink: string;
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "signup",
      email: profile.email,
      options: { redirectTo },
    });

    if (linkError || !linkData?.properties?.action_link) {
      console.log("[send-registration-email] Signup link failed, trying magiclink:", linkError?.message);
      const { data: magicData, error: magicError } = await adminClient.auth.admin.generateLink({
        type: "magiclink",
        email: profile.email,
        options: { redirectTo },
      });
      if (magicError || !magicData?.properties?.action_link) {
        throw new Error(magicError?.message || "Failed to generate activation link");
      }
      activationLink = magicData.properties.action_link;
    } else {
      activationLink = linkData.properties.action_link;
    }

    // Ensure the action_link redirect_to points to the correct tenant domain
    // Supabase may override redirect_to if it's not in the server's allowlist
    try {
      const linkUrl = new URL(activationLink);
      linkUrl.searchParams.set("redirect_to", redirectTo);
      activationLink = linkUrl.toString();
      console.log("[send-registration-email] Rewritten activation link redirect_to:", redirectTo);
    } catch (e) {
      console.warn("[send-registration-email] Could not rewrite activation link URL:", e);
    }

    // Build email content
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

    // Append email signature
    const emailSignature = resolveEmailSignature(tenantConfig, userLang);
    if (emailSignature) {
      body = body + emailSignature;
    }

    // ── Resolve SMTP using standard 3-tier fallback ──
    const smtp = await resolveSmtp(adminClient, tenant_id, tenantConfig);

    let emailSent = false;
    let messageId = "";
    let smtpError = "";

    if (smtp) {
      const transporter = await createSmtpTransporter(smtp);
      if (transporter) {
        try {
          const info = await transporter.sendMail({
            from: buildFromHeader(smtp),
            to: profile.email,
            subject,
            html: body,
          });
          emailSent = true;
          messageId = info.messageId;
          console.log(`[send-registration-email] Email sent: ${messageId}`);
        } catch (err: any) {
          smtpError = err.message;
          console.error(`[send-registration-email] SMTP error: ${smtpError}`);
        }
      } else {
        smtpError = "All SMTP connection strategies failed";
      }
    } else {
      smtpError = "No SMTP configured (tenant, head office, or env)";
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
        smtp_source: smtp?.source || "none",
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        email_sent: emailSent,
        message_id: messageId || undefined,
        smtp_error: smtpError || undefined,
        smtp_source: smtp?.source || "none",
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
