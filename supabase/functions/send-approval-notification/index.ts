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

    // Fetch tenant config
    const { data: tenantConfig } = await adminClient
      .from("tenant_configuration")
      .select("smtp_host, smtp_port, smtp_username, smtp_password, smtp_from_email, smtp_from_name, smtp_enable_ssl, email_signature_en, email_signature_af, legal_entity_id, approval_cc_email")
      .eq("tenant_id", tenant_id)
      .maybeSingle();

    // ── Resolve SMTP using standard 3-tier fallback ──
    const smtp = await resolveSmtp(adminClient, tenant_id, tenantConfig);
    if (!smtp) {
      console.warn("[send-approval-notification] No SMTP configured anywhere");
      return new Response(JSON.stringify({ success: false, error: "No SMTP configured" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tenantName = await resolveTenantDisplayName(adminClient, tenant_id, tenantConfig);

    // Find approvers: users with clerk, tenant_admin, or super_admin roles
    const { data: approverRoles } = await adminClient
      .from("user_roles")
      .select("user_id, role")
      .eq("tenant_id", tenant_id)
      .in("role", ["clerk", "tenant_admin"]);

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
      return new Response(JSON.stringify({ success: true, emails_sent: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: approverProfiles } = await adminClient
      .from("profiles")
      .select("user_id, first_name, last_name, email, language_code")
      .in("user_id", allApproverUserIds);

    if (!approverProfiles?.length) {
      return new Response(JSON.stringify({ success: true, emails_sent: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create transporter once for all approvers
    const transporter = await createSmtpTransporter(smtp);
    if (!transporter) {
      return new Response(JSON.stringify({ error: "SMTP connection failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fromHeader = buildFromHeader(smtp);
    const formattedAmount = amount
      ? `R ${Number(amount).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : "";

    let emailsSent = 0;

    for (const profile of approverProfiles) {
      if (!profile.email) continue;

      const userLang = profile.language_code || "en";

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

      const emailSignature = resolveEmailSignature(tenantConfig, userLang);

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
        const ccEmail = tenantConfig?.approval_cc_email?.trim() || undefined;
        const info = await transporter.sendMail({ from: fromHeader, to: profile.email, ...(ccEmail ? { cc: ccEmail } : {}), subject, html: body });
        emailsSent++;
        console.log(`[send-approval-notification] Sent to ${profile.email}: ${info.messageId} (SMTP source: ${smtp.source})`);

        try {
          await adminClient.from("email_logs").insert({
            tenant_id,
            recipient_email: profile.email,
            recipient_user_id: profile.user_id,
            application_event: "pending_approval_notification",
            subject,
            status: "sent",
            message_id: info.messageId,
            metadata: { transaction_type, member_name, account_number, amount, smtp_source: smtp.source },
          });
        } catch (logErr: any) {
          console.warn("[send-approval-notification] Failed to log:", logErr.message);
        }
      } catch (smtpErr: any) {
        console.error(`[send-approval-notification] SMTP error for ${profile.email}:`, smtpErr.message);
      }
    }

    return new Response(
      JSON.stringify({ success: true, emails_sent: emailsSent, smtp_source: smtp.source }),
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
