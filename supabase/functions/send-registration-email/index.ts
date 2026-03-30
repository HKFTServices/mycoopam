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
    const { tenant_id, user_id: explicitUserId, self_register_email, is_tenant_creator, coop_name } = reqBody;
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

    // For tenant creators, use a dedicated template event; fallback to the standard one
    const templateEvent = is_tenant_creator
      ? "tenant_registration_completed"
      : "user_registration_completed";

    const { data: template } = await adminClient
      .from("communication_templates")
      .select("subject, body_html")
      .eq("tenant_id", tenant_id)
      .eq("application_event", templateEvent)
      .eq("is_active", true)
      .eq("is_email_active", true)
      .eq("language_code", userLang)
      .maybeSingle();

    // If tenant creator template not found, fall back to standard
    let finalTemplate = template;
    if (!finalTemplate && is_tenant_creator) {
      const { data: fallback } = await adminClient
        .from("communication_templates")
        .select("subject, body_html")
        .eq("tenant_id", tenant_id)
        .eq("application_event", "user_registration_completed")
        .eq("is_active", true)
        .eq("is_email_active", true)
        .eq("language_code", userLang)
        .maybeSingle();
      finalTemplate = fallback;
    }

    const firstName = profile.first_name || "Member";
    const tenantName = await resolveTenantDisplayName(adminClient, tenant_id, tenantConfig);
    const displayCoopName = coop_name || tenantName;

    // Build redirect URL using tenant slug → correct subdomain
    const redirectTo = buildTenantUrl(tenant?.slug, "/auth");

    // Generate a password-reset link so imported members can set their own password
    let activationLink: string;
    const resetRedirectTo = buildTenantUrl(tenant?.slug, "/reset-password");

    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "recovery",
      email: profile.email,
      options: { redirectTo: resetRedirectTo },
    });

    if (linkError || !linkData?.properties?.action_link) {
      // Fallback to magiclink if recovery link fails
      console.log("[send-registration-email] Recovery link failed, trying magiclink:", linkError?.message);
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

    // Rewrite the link to go through the tenant domain directly.
    try {
      const linkUrl = new URL(activationLink);
      const tokenHash = linkUrl.searchParams.get("token_hash") || linkUrl.searchParams.get("token");
      const linkType = linkUrl.searchParams.get("type") || "recovery";
      if (tokenHash) {
        activationLink = `${resetRedirectTo}#token_hash=${encodeURIComponent(tokenHash)}&type=${linkType}`;
        console.log("[send-registration-email] Rewrote link to tenant reset-password page:", resetRedirectTo);
      } else {
        linkUrl.searchParams.set("redirect_to", resetRedirectTo);
        activationLink = linkUrl.toString();
        console.log("[send-registration-email] Updated redirect_to on activation link");
      }
    } catch (e) {
      console.warn("[send-registration-email] Could not rewrite activation link URL:", e);
    }

    // Build email content – use tenant-creator specific fallback when applicable
    let subject: string;
    let body: string;

    if (finalTemplate?.subject && finalTemplate?.body_html) {
      subject = finalTemplate.subject;
      body = finalTemplate.body_html;
    } else if (is_tenant_creator) {
      // Tenant admin / creator specific email
      subject = `Welcome to MyCo-Op – ${displayCoopName} has been registered!`;
      body = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#ffffff;">
        <div style="text-align:center;margin-bottom:24px;">
          <img src="https://www.myco-op.co.za/lovable-uploads/mycoop-logo.png" alt="MyCo-Op" style="height:48px;object-fit:contain;" />
        </div>
        <h2 style="color:#1a1a2e;">Congratulations – Your Co-operative is Registered! 🎉</h2>
        <p>Dear ${firstName},</p>
        <p>Your co-operative <strong>${displayCoopName}</strong> has been successfully registered on the MyCo-Op platform.</p>
        <p>As the Tenant Administrator, you now have full access to configure and manage your co-operative.</p>
        <h3 style="color:#1a1a2e;margin-top:24px;">What to do next</h3>
        <ol style="color:#333;line-height:1.8;">
          <li><strong>Activate your account</strong> by clicking the button below to verify your email address.</li>
          <li><strong>Log in</strong> to your co-operative's administration portal.</li>
          <li><strong>Follow the Tenant Setup Guide</strong> – when you first log in, an interactive setup wizard will guide you through all the essential configuration steps (SMTP email, investment pools, fees, document requirements, terms &amp; conditions, and more).</li>
          <li><strong>Once setup is complete</strong>, your members will be able to register and transact on your platform.</li>
        </ol>
        <div style="margin:32px 0;text-align:center;">
          <a href="{{activation_link}}" style="display:inline-block;background:#1a1a2e;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;">Activate Your Account</a>
        </div>
        <p style="font-size:13px;color:#666;">If the button does not work, copy and paste this link into your browser:</p>
        <p style="font-size:13px;word-break:break-all;color:#1a1a2e;">{{activation_link}}</p>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
        <p style="font-size:13px;color:#666;">For more information, please visit <a href="https://www.myco-op.co.za" style="color:#1a1a2e;">www.myco-op.co.za</a> or contact our support team.</p>
        <p style="font-size:13px;color:#666;">Best regards,<br/><strong>The MyCo-Op Team</strong></p>
      </div>`;
    } else {
      subject = `Welcome to ${tenantName} – Activate Your Account`;
      body = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:0;background:#ffffff;">
        <div style="background:#1a1a2e;padding:24px 32px;text-align:center;">
          <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:700;">Welcome to ${tenantName}</h1>
        </div>
        <div style="padding:32px;">
          <p style="font-size:15px;color:#333;margin:0 0 16px;">Dear ${firstName},</p>
          <p style="font-size:15px;color:#333;margin:0 0 16px;">
            Your membership account at <strong>${tenantName}</strong> has been set up and is ready for you.
          </p>
          <p style="font-size:15px;color:#333;margin:0 0 24px;">
            To get started, please activate your account by clicking the button below. This will verify your email address and give you full access to the platform.
          </p>

          <div style="margin:28px 0;text-align:center;">
            <a href="{{activation_link}}" style="display:inline-block;background:#1a1a2e;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:15px;">Activate My Account</a>
          </div>

          <h3 style="color:#1a1a2e;margin:28px 0 12px;font-size:15px;">What happens next?</h3>
          <ol style="color:#333;font-size:14px;line-height:1.8;padding-left:20px;margin:0 0 24px;">
            <li><strong>Click the button above</strong> to verify your email and set your password.</li>
            <li><strong>Log in</strong> to your personal dashboard.</li>
            <li><strong>Complete your profile</strong> – review and update your personal details, upload any outstanding documents, and add your banking information.</li>
            <li><strong>Start transacting</strong> – make deposits, view your portfolio, and manage your membership.</li>
          </ol>

          <p style="font-size:13px;color:#888;margin:0 0 8px;">If the button does not work, copy and paste this link into your browser:</p>
          <p style="font-size:13px;word-break:break-all;color:#1a1a2e;margin:0 0 24px;">{{activation_link}}</p>

          <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
          <p style="font-size:14px;color:#333;margin:0;">Best regards,<br/><strong>${tenantName}</strong></p>
        </div>
      </div>`;
    }

    const emailSignature = resolveEmailSignature(tenantConfig, userLang);

    const replacements: Record<string, string> = {
      "{{entity_name}}": [profile.first_name, profile.last_name].filter(Boolean).join(" ") || firstName,
      "{{user_name}}": firstName,
      "{{user_surname}}": profile.last_name || "",
      "{{first_name}}": [profile.first_name, profile.last_name].filter(Boolean).join(" ") || firstName,
      "{{last_name}}": "",
      "{{tenant_name}}": tenantName,
      "{{coop_name}}": displayCoopName,
      "{{email}}": profile.email,
      "{{activation_link}}": activationLink,
      "{{confirmation_link}}": activationLink,
      "{{email_signature}}": emailSignature || "",
    };
    for (const [key, val] of Object.entries(replacements)) {
      subject = subject.replaceAll(key, val);
      body = body.replaceAll(key, val);
    }

    // If the template body doesn't contain the activation link anywhere (custom templates missing the placeholder),
    // inject an activation button block before the closing tag or at the end
    if (!body.includes(activationLink)) {
      const activationBlock = `
        <div style="margin:28px 0;text-align:center;">
          <a href="${activationLink}" style="display:inline-block;background:#1a1a2e;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:15px;">Activate My Account</a>
        </div>
        <p style="font-size:13px;color:#888;">If the button does not work, copy and paste this link into your browser:</p>
        <p style="font-size:13px;word-break:break-all;color:#1a1a2e;">${activationLink}</p>`;

      // Try to insert before closing </div>, </body>, or signature — or just append
      if (body.includes("{{email_signature}}") || body.includes(emailSignature)) {
        const sigTarget = body.includes(emailSignature) ? emailSignature : "";
        if (sigTarget) {
          body = body.replace(sigTarget, activationBlock + sigTarget);
        } else {
          body = body + activationBlock;
        }
      } else {
        body = body + activationBlock;
      }
      console.log("[send-registration-email] Injected activation link into custom template");
    }

    // For non-tenant-creator emails, append signature if not already in template
    if (!is_tenant_creator && emailSignature && !body.includes(emailSignature)) {
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
