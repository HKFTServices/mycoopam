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
    const { data: userData, error: userErr } = await anonClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const { tenant_id, entity_account_id } = await req.json();
    if (!tenant_id) {
      return new Response(JSON.stringify({ error: "tenant_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: profile } = await adminClient
      .from("profiles")
      .select("first_name, last_name, email, language_code")
      .eq("user_id", userId)
      .maybeSingle();

    // Fallback: if no profile email, resolve from entity via user_entity_relationships
    let recipientEmail = profile?.email || null;
    let recipientFirstName = profile?.first_name || "";
    let recipientLastName = profile?.last_name || "";
    let recipientLang = profile?.language_code || "en";

    if (!recipientEmail) {
      const { data: uer } = await adminClient
        .from("user_entity_relationships")
        .select("entity_id, entities!inner(name, last_name, email_address, language_code)")
        .eq("user_id", userId)
        .eq("tenant_id", tenant_id)
        .limit(1)
        .maybeSingle();
      const ent = (uer as any)?.entities;
      if (ent?.email_address) {
        recipientEmail = ent.email_address;
        recipientFirstName = recipientFirstName || ent.name || "";
        recipientLastName = recipientLastName || ent.last_name || "";
        recipientLang = ent.language_code || recipientLang;
        console.log(`[send-account-creation-email] Using entity email ${recipientEmail} for user ${userId}`);
      }
    }

    if (!recipientEmail) {
      return new Response(JSON.stringify({ error: "User profile or email not found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch tenant config
    const { data: tenantConfig } = await adminClient
      .from("tenant_configuration")
      .select("smtp_host, smtp_port, smtp_username, smtp_password, smtp_from_email, smtp_from_name, smtp_enable_ssl, email_signature_en, email_signature_af, legal_entity_id")
      .eq("tenant_id", tenant_id)
      .maybeSingle();

    // Resolve entity account name
    let entityAccountName = "";
    let accountNumber = "";
    if (entity_account_id) {
      const { data: ea } = await adminClient
        .from("entity_accounts")
        .select("account_number, entity_id")
        .eq("id", entity_account_id)
        .single();
      if (ea) {
        accountNumber = ea.account_number || "";
        const { data: entity } = await adminClient
          .from("entities")
          .select("name, last_name")
          .eq("id", ea.entity_id)
          .single();
        entityAccountName = entity ? [entity.name, entity.last_name].filter(Boolean).join(" ") : "";
      }
    }

    // Fallback: find by user's entity
    if (!entityAccountName) {
      const { data: uer } = await adminClient
        .from("user_entity_relationships")
        .select("entity_id")
        .eq("user_id", userId)
        .eq("tenant_id", tenant_id)
        .limit(1)
        .maybeSingle();
      if (uer?.entity_id) {
        const { data: accts } = await adminClient
          .from("entity_accounts")
          .select("account_number, entity_id, entities!entity_accounts_entity_id_fkey(name, last_name)")
          .eq("entity_id", uer.entity_id)
          .eq("tenant_id", tenant_id)
          .order("created_at", { ascending: false })
          .limit(1);
        if (accts && accts.length > 0) {
          const acct = accts[0] as any;
          accountNumber = acct.account_number || "";
          const e = acct.entities;
          entityAccountName = e ? [e.name, e.last_name].filter(Boolean).join(" ") : "";
        }
      }
    }

    // Resolve legal entity bank details
    let legalEntityBankDetails = "";
    if (tenantConfig?.legal_entity_id) {
      const { data: bankRows } = await adminClient
        .from("entity_bank_details")
        .select("account_holder, account_number, bank_id, banks!entity_bank_details_bank_id_fkey(name, branch_code)")
        .eq("entity_id", tenantConfig.legal_entity_id)
        .eq("is_active", true)
        .eq("is_deleted", false)
        .limit(1);
      if (bankRows && bankRows.length > 0) {
        const b = bankRows[0] as any;
        const bankName = b.banks?.name || "";
        const branchCode = b.banks?.branch_code || "";
        legalEntityBankDetails = [
          bankName ? `Bank: ${bankName}` : "",
          branchCode ? `Branch Code: ${branchCode}` : "",
          b.account_holder ? `Account Holder: ${b.account_holder}` : "",
          b.account_number ? `Account Number: ${b.account_number}` : "",
        ].filter(Boolean).join(", ");
      }
    }

    const userLang = recipientLang;
    const { data: template } = await adminClient
      .from("communication_templates")
      .select("subject, body_html")
      .eq("tenant_id", tenant_id)
      .eq("application_event", "account_creation_successful")
      .eq("is_active", true)
      .eq("is_email_active", true)
      .eq("language_code", userLang)
      .maybeSingle();

    const firstName = recipientFirstName || "Member";
    const tenantName = await resolveTenantDisplayName(adminClient, tenant_id, tenantConfig);
    const emailSignature = resolveEmailSignature(tenantConfig, userLang);

    let subject = template?.subject || `Welcome to ${tenantName} – Membership Application Received!`;
    let body = template?.body_html ||
      `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
        <h2 style="color:#1a1a2e;">Membership Application Received!</h2>
        <p>Dear ${firstName},</p>
        <p>Thank you for applying for membership with <strong>${tenantName}</strong>.</p>
        <p>Your application has been received and is pending activation. Your membership account will be activated once your first deposit is received.</p>
        <p>You will receive a confirmation once your account is fully active.</p>
        <br/>
        <p>Best regards,<br/><strong>${tenantName}</strong></p>
      </div>`;

    const replacements: Record<string, string> = {
      "{{entity_name}}": [recipientFirstName, recipientLastName].filter(Boolean).join(" ") || firstName,
      "{{user_name}}": firstName,
      "{{user_surname}}": recipientLastName,
      "{{first_name}}": [recipientFirstName, recipientLastName].filter(Boolean).join(" ") || firstName,
      "{{last_name}}": "",
      "{{tenant_name}}": tenantName,
      "{{legal_entity_name}}": tenantName,
      "{{email}}": recipientEmail,
      "{{email_address}}": recipientEmail,
      "{{entity_account_name}}": entityAccountName,
      "{{account_number}}": accountNumber,
      "{{entity_account_bank_details}}": legalEntityBankDetails,
      "{{Tenant.LegalEntityBankDetails}}": legalEntityBankDetails,
      "{{email_signature}}": emailSignature,
    };
    for (const [key, val] of Object.entries(replacements)) {
      subject = subject.replaceAll(key, val);
      body = body.replaceAll(key, val);
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
            to: recipientEmail,
            subject,
            html: body,
          });
          emailSent = true;
          messageId = info.messageId;
          console.log(`[send-account-creation-email] Sent: ${messageId} to ${recipientEmail} (SMTP source: ${smtp.source})`);
        } catch (err: any) {
          smtpError = err.message;
          console.error(`[send-account-creation-email] SMTP error: ${smtpError}`);
        }
      } else {
        smtpError = "All SMTP connection strategies failed";
      }
    } else {
      smtpError = "No SMTP configured (tenant, head office, or env)";
      console.warn(`[send-account-creation-email] ${smtpError}`);
    }

    return new Response(
      JSON.stringify({ success: true, email_sent: emailSent, message_id: messageId || undefined, smtp_error: smtpError || undefined, smtp_source: smtp?.source || "none", recipient: recipientEmail, subject }),
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
