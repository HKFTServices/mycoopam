import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.10";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Sends an email notification to the next approver(s) when a member submits
 * a transaction for approval. Uses tenant SMTP and communication templates.
 *
 * Body: { tenant_id, transaction_type, member_name, account_number, amount, transaction_date }
 */
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

    // Verify caller
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

    const {
      tenant_id,
      transaction_type,
      member_name,
      account_number,
      amount,
      transaction_date,
    } = await req.json();

    if (!tenant_id) {
      return new Response(JSON.stringify({ error: "tenant_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch tenant SMTP + signature config
    const { data: tenantConfig } = await adminClient
      .from("tenant_configuration")
      .select("smtp_host, smtp_port, smtp_username, smtp_password, smtp_from_email, smtp_from_name, smtp_enable_ssl, email_signature_en, email_signature_af, legal_entity_id")
      .eq("tenant_id", tenant_id)
      .maybeSingle();

    if (!tenantConfig?.smtp_host || !tenantConfig?.smtp_from_email) {
      console.warn("[send-approval-notification] SMTP not configured for tenant");
      return new Response(JSON.stringify({ success: false, error: "SMTP not configured" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve tenant display name
    const { data: tenant } = await adminClient
      .from("tenants")
      .select("name")
      .eq("id", tenant_id)
      .single();

    let tenantName = tenant?.name || "the cooperative";
    if (tenantConfig.legal_entity_id) {
      const { data: legalEntity } = await adminClient
        .from("entities")
        .select("name")
        .eq("id", tenantConfig.legal_entity_id)
        .single();
      if (legalEntity?.name) tenantName = legalEntity.name;
    }

    // Find approvers: users with clerk, tenant_admin, or super_admin roles for this tenant
    const { data: approverRoles } = await adminClient
      .from("user_roles")
      .select("user_id, role")
      .eq("tenant_id", tenant_id)
      .in("role", ["clerk", "tenant_admin"]);

    // Also include super_admins (tenant_id is null for super_admin)
    const { data: superAdminRoles } = await adminClient
      .from("user_roles")
      .select("user_id, role")
      .eq("role", "super_admin");

    const allApproverUserIds = [
      ...new Set([
        ...(approverRoles || []).map((r: any) => r.user_id),
        ...(superAdminRoles || []).map((r: any) => r.user_id),
      ]),
    ];

    if (allApproverUserIds.length === 0) {
      console.warn("[send-approval-notification] No approvers found for tenant");
      return new Response(JSON.stringify({ success: true, emails_sent: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch profiles for approvers
    const { data: approverProfiles } = await adminClient
      .from("profiles")
      .select("user_id, first_name, last_name, email, language_code")
      .in("user_id", allApproverUserIds);

    if (!approverProfiles?.length) {
      console.warn("[send-approval-notification] No approver profiles found");
      return new Response(JSON.stringify({ success: true, emails_sent: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Setup SMTP transporter
    const requestedPort = tenantConfig.smtp_port || 587;
    const usePort = requestedPort === 465 ? 587 : requestedPort;

    const transporter = nodemailer.createTransport({
      host: tenantConfig.smtp_host,
      port: usePort,
      secure: false,
      ignoreTLS: true,
      auth: tenantConfig.smtp_username
        ? { user: tenantConfig.smtp_username, pass: tenantConfig.smtp_password || "" }
        : undefined,
    });

    const isSmtpUserEmail = tenantConfig.smtp_username?.includes("@");
    const effectiveFromEmail = isSmtpUserEmail ? tenantConfig.smtp_username : tenantConfig.smtp_from_email;
    const fromHeader = tenantConfig.smtp_from_name
      ? `"${tenantConfig.smtp_from_name}" <${effectiveFromEmail}>`
      : effectiveFromEmail;

    const formattedAmount = amount
      ? `R ${Number(amount).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : "";

    let emailsSent = 0;

    for (const profile of approverProfiles) {
      if (!profile.email) continue;

      const userLang = profile.language_code || "en";

      // Try to fetch custom template
      const { data: template } = await adminClient
        .from("communication_templates")
        .select("subject, body_html")
        .eq("tenant_id", tenant_id)
        .eq("application_event", "pending_approval_notification")
        .eq("is_active", true)
        .eq("is_email_active", true)
        .eq("language_code", userLang)
        .maybeSingle();

      const approverName = profile.first_name || "Admin";

      const defaultSubjectEn = `Action Required: ${transaction_type || "Transaction"} Pending Approval — ${tenantName}`;
      const defaultSubjectAf = `Aksie Vereis: ${transaction_type || "Transaksie"} Wag vir Goedkeuring — ${tenantName}`;

      const defaultBodyEn = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
          <h2 style="color:#1e3a5f;margin-bottom:16px;">Transaction Pending Approval</h2>
          <p style="color:#333;font-size:15px;">Dear {{user_name}},</p>
          <p style="color:#333;font-size:15px;">A new transaction has been submitted by a member and requires your review and approval.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#f9fafb;border-radius:8px;">
            <tr><td style="padding:10px 14px;color:#666;border-bottom:1px solid #eee;">Member</td><td style="padding:10px 14px;font-weight:600;border-bottom:1px solid #eee;">{{entity_account_name}}</td></tr>
            <tr><td style="padding:10px 14px;color:#666;border-bottom:1px solid #eee;">Account Number</td><td style="padding:10px 14px;font-weight:600;border-bottom:1px solid #eee;">{{account_number}}</td></tr>
            <tr><td style="padding:10px 14px;color:#666;border-bottom:1px solid #eee;">Transaction Type</td><td style="padding:10px 14px;font-weight:600;border-bottom:1px solid #eee;">{{transaction_type}}</td></tr>
            <tr><td style="padding:10px 14px;color:#666;border-bottom:1px solid #eee;">Amount</td><td style="padding:10px 14px;font-weight:600;border-bottom:1px solid #eee;">{{amount}}</td></tr>
            <tr><td style="padding:10px 14px;color:#666;">Date</td><td style="padding:10px 14px;font-weight:600;">{{transaction_date}}</td></tr>
          </table>
          <p style="color:#333;font-size:15px;">Please log in to the system to review and action this request.</p>
          <br/>
          <p style="color:#333;font-size:14px;">Kind regards,<br/><strong>{{tenant_name}}</strong></p>
          {{email_signature}}
        </div>`;

      const defaultBodyAf = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
          <h2 style="color:#1e3a5f;margin-bottom:16px;">Transaksie Wag vir Goedkeuring</h2>
          <p style="color:#333;font-size:15px;">Geagte {{user_name}},</p>
          <p style="color:#333;font-size:15px;">'n Nuwe transaksie is deur 'n lid ingedien en vereis u hersiening en goedkeuring.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#f9fafb;border-radius:8px;">
            <tr><td style="padding:10px 14px;color:#666;border-bottom:1px solid #eee;">Lid</td><td style="padding:10px 14px;font-weight:600;border-bottom:1px solid #eee;">{{entity_account_name}}</td></tr>
            <tr><td style="padding:10px 14px;color:#666;border-bottom:1px solid #eee;">Rekening Nommer</td><td style="padding:10px 14px;font-weight:600;border-bottom:1px solid #eee;">{{account_number}}</td></tr>
            <tr><td style="padding:10px 14px;color:#666;border-bottom:1px solid #eee;">Transaksie Tipe</td><td style="padding:10px 14px;font-weight:600;border-bottom:1px solid #eee;">{{transaction_type}}</td></tr>
            <tr><td style="padding:10px 14px;color:#666;border-bottom:1px solid #eee;">Bedrag</td><td style="padding:10px 14px;font-weight:600;border-bottom:1px solid #eee;">{{amount}}</td></tr>
            <tr><td style="padding:10px 14px;color:#666;">Datum</td><td style="padding:10px 14px;font-weight:600;">{{transaction_date}}</td></tr>
          </table>
          <p style="color:#333;font-size:15px;">Meld asseblief aan by die stelsel om hierdie versoek te hersien en te hanteer.</p>
          <br/>
          <p style="color:#333;font-size:14px;">Vriendelike groete,<br/><strong>{{tenant_name}}</strong></p>
          {{email_signature}}
        </div>`;

      let subject = template?.subject || (userLang === "af" ? defaultSubjectAf : defaultSubjectEn);
      let body = template?.body_html || (userLang === "af" ? defaultBodyAf : defaultBodyEn);

      // Resolve email signature
      const emailSignature = userLang === "af"
        ? (tenantConfig.email_signature_af || tenantConfig.email_signature_en || "")
        : (tenantConfig.email_signature_en || "");

      // Replace merge fields
      const replacements: Record<string, string> = {
        "{{user_name}}": approverName,
        "{{user_surname}}": profile.last_name || "",
        "{{entity_account_name}}": member_name || "",
        "{{account_number}}": account_number || "",
        "{{transaction_type}}": transaction_type || "",
        "{{amount}}": formattedAmount,
        "{{transaction_date}}": transaction_date || "",
        "{{tenant_name}}": tenantName,
        "{{email_signature}}": emailSignature,
      };

      for (const [key, val] of Object.entries(replacements)) {
        subject = subject.replaceAll(key, val);
        body = body.replaceAll(key, val);
      }

      try {
        const info = await transporter.sendMail({
          from: fromHeader,
          to: profile.email,
          subject,
          html: body,
        });
        emailsSent++;
        console.log(`[send-approval-notification] Sent to ${profile.email}: ${info.messageId}`);

        // Log email
        try {
          await adminClient.from("email_logs").insert({
            tenant_id,
            recipient_email: profile.email,
            recipient_user_id: profile.user_id,
            application_event: "pending_approval_notification",
            subject,
            status: "sent",
            message_id: info.messageId,
            metadata: { transaction_type, member_name, account_number, amount },
          });
        } catch (logErr: any) {
          console.warn("[send-approval-notification] Failed to log:", logErr.message);
        }
      } catch (smtpErr: any) {
        console.error(`[send-approval-notification] SMTP error for ${profile.email}:`, smtpErr.message);
      }
    }

    return new Response(
      JSON.stringify({ success: true, emails_sent: emailsSent }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[send-approval-notification] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
