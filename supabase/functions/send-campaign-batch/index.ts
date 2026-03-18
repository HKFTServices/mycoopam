import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.10";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BATCH_SIZE = 300;
const DELAY_BETWEEN_EMAILS_MS = 2000;

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

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const body = await req.json();
    const { action, tenant_id, template_id } = body;

    // ── TEST EMAIL ──
    if (action === "test") {
      const { test_user_id, custom_fields } = body;
      const cf = custom_fields || {};
      const { data: profile } = await adminClient
        .from("profiles")
        .select("first_name, last_name, email, language_code")
        .eq("user_id", test_user_id)
        .single();

      if (!profile?.email) {
        return new Response(JSON.stringify({ error: "No email found" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { template, transporter, fromHeader, tenantName, legalEntityName, signature } = await resolveSmtpAndTemplate(
        adminClient,
        tenant_id,
        template_id,
        profile.language_code || "en"
      );

      if (!template || !transporter) {
        return new Response(JSON.stringify({ error: "Template or SMTP not configured" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { subject, html } = renderTemplate(template, {
        entity_name: [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "Test",
        user_name: profile.first_name || "Test",
        user_surname: profile.last_name || "User",
        email_address: profile.email,
        tenant_name: tenantName,
        legal_entity_name: legalEntityName,
        email_signature: signature,
        agm_venue: cf.agm_venue || "",
        agm_date: cf.agm_date || "",
        agm_time: cf.agm_time || "",
      });

      await transporter.sendMail({
        from: fromHeader,
        to: profile.email,
        subject: `[TEST] ${subject}`,
        html,
      });

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── CREATE CAMPAIGN & START SENDING ──
    if (action === "create") {
      const { campaign_name, audience_type, recipients, attachment_type, created_by } = body;

      // Create campaign
      const { data: campaign, error: campErr } = await adminClient
        .from("message_campaigns")
        .insert({
          tenant_id,
          name: campaign_name,
          audience_type,
          template_id,
          attachment_type: attachment_type || null,
          status: "sending",
          total_recipients: recipients.length,
          created_by,
        })
        .select("id")
        .single();

      if (campErr) throw campErr;
      const campaignId = campaign.id;

      // Insert recipients in batches
      const recipientRows = recipients.map((r: any, i: number) => ({
        campaign_id: campaignId,
        tenant_id,
        user_id: r.user_id,
        entity_id: r.entity_id,
        entity_account_id: r.entity_account_id,
        recipient_email: r.email,
        recipient_name: r.name,
        status: "pending",
        batch_number: Math.floor(i / BATCH_SIZE) + 1,
      }));

      // Insert all recipient rows
      const chunkSize = 500;
      for (let i = 0; i < recipientRows.length; i += chunkSize) {
        const chunk = recipientRows.slice(i, i + chunkSize);
        await adminClient.from("message_campaign_recipients").insert(chunk);
      }

      // Start sending first batch in background (non-blocking)
      sendBatchBackground(adminClient, campaignId, tenant_id, template_id, 1);

      return new Response(JSON.stringify({ success: true, campaign_id: campaignId }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[send-campaign-batch] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function resolveSmtpAndTemplate(
  adminClient: any,
  tenantId: string,
  templateId: string,
  langCode: string
) {
  // Fetch tenant SMTP
  const { data: tenantConfig } = await adminClient
    .from("tenant_configuration")
    .select("smtp_host, smtp_port, smtp_username, smtp_password, smtp_from_email, smtp_from_name, smtp_enable_ssl, email_signature_en, email_signature_af, legal_entity_id")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!tenantConfig?.smtp_host || !tenantConfig?.smtp_from_email) {
    return { template: null, transporter: null, fromHeader: "", tenantName: "", signature: "" };
  }

  // Fetch template
  const { data: template } = await adminClient
    .from("communication_templates")
    .select("subject, body_html")
    .eq("id", templateId)
    .single();

  // Resolve tenant name and legal entity name
  let tenantName = "";
  let legalEntityName = "";
  const { data: tenant } = await adminClient.from("tenants").select("name").eq("id", tenantId).single();
  tenantName = tenant?.name || "";
  if (tenantConfig.legal_entity_id) {
    const { data: le } = await adminClient.from("entities").select("name").eq("id", tenantConfig.legal_entity_id).single();
    if (le?.name) {
      legalEntityName = le.name;
      tenantName = le.name;
    }
  }

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

  const signature = langCode === "af"
    ? (tenantConfig.email_signature_af || tenantConfig.email_signature_en || "")
    : (tenantConfig.email_signature_en || "");

  return { template, transporter, fromHeader, tenantName, legalEntityName, signature };
}

function renderTemplate(
  template: { subject: string; body_html: string },
  vars: Record<string, string>
) {
  let subject = template.subject || "";
  let html = template.body_html || "";

  const replacements: Record<string, string> = {
    "{{entity_name}}": vars.entity_name || "",
    "{{legal_entity_name}}": vars.legal_entity_name || "",
    "{{user_name}}": vars.user_name || "",
    "{{user_surname}}": vars.user_surname || "",
    "{{first_name}}": vars.entity_name || "",
    "{{last_name}}": "",
    "{{email_address}}": vars.email_address || "",
    "{{tenant_name}}": vars.tenant_name || "",
    "{{email_signature}}": vars.email_signature || "",
    "{{title}}": vars.title || "",
    "{{phone_number}}": vars.phone_number || "",
    "{{account_number}}": vars.account_number || "",
    "{{entity_account_name}}": vars.entity_account_name || "",
    "{{agm_venue}}": vars.agm_venue || "",
    "{{agm_date}}": vars.agm_date || "",
    "{{agm_time}}": vars.agm_time || "",
  };

  for (const [key, val] of Object.entries(replacements)) {
    subject = subject.replaceAll(key, val);
    html = html.replaceAll(key, val);
  }

  // Auto-append signature if not already in body
  if (vars.email_signature && !html.includes(vars.email_signature)) {
    html = html + vars.email_signature;
  }

  return { subject, html };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendBatchBackground(
  adminClient: any,
  campaignId: string,
  tenantId: string,
  templateId: string,
  batchNumber: number
) {
  try {
    // Get pending recipients for this batch
    const { data: recipients } = await adminClient
      .from("message_campaign_recipients")
      .select("*")
      .eq("campaign_id", campaignId)
      .eq("batch_number", batchNumber)
      .eq("status", "pending")
      .order("created_at")
      .limit(BATCH_SIZE);

    if (!recipients || recipients.length === 0) {
      // Check if more batches exist
      const { data: moreRecipients } = await adminClient
        .from("message_campaign_recipients")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaignId)
        .eq("status", "pending");

      if (!moreRecipients || (moreRecipients as any) === 0) {
        // All done
        await adminClient
          .from("message_campaigns")
          .update({ status: "completed", completed_at: new Date().toISOString() })
          .eq("id", campaignId);
      }
      return;
    }

    const { template, transporter, fromHeader, tenantName, legalEntityName, signature } = await resolveSmtpAndTemplate(
      adminClient,
      tenantId,
      templateId,
      "en" // default to English for batch
    );

    if (!template || !transporter) {
      await adminClient
        .from("message_campaigns")
        .update({ status: "failed" })
        .eq("id", campaignId);
      return;
    }

    let sentCount = 0;
    let failedCount = 0;

    for (const recipient of recipients) {
      try {
        // Resolve entity name from recipient_name (already entity name)
        const entityName = recipient.recipient_name || "";
        // Resolve user profile if user_id available
        let userName = "";
        let userSurname = "";
        if (recipient.user_id) {
          const { data: userProfile } = await adminClient
            .from("profiles")
            .select("first_name, last_name")
            .eq("user_id", recipient.user_id)
            .maybeSingle();
          if (userProfile) {
            userName = userProfile.first_name || "";
            userSurname = userProfile.last_name || "";
          }
        } else if (recipient.entity_id) {
          // Try to find user via user_entity_relationships
          const { data: rel } = await adminClient
            .from("user_entity_relationships")
            .select("user_id")
            .eq("entity_id", recipient.entity_id)
            .eq("is_active", true)
            .limit(1)
            .maybeSingle();
          if (rel?.user_id) {
            const { data: userProfile } = await adminClient
              .from("profiles")
              .select("first_name, last_name")
              .eq("user_id", rel.user_id)
              .maybeSingle();
            if (userProfile) {
              userName = userProfile.first_name || "";
              userSurname = userProfile.last_name || "";
            }
          }
        }
        const { subject, html } = renderTemplate(template, {
          entity_name: entityName,
          user_name: userName,
          user_surname: userSurname,
          email_address: recipient.recipient_email,
          tenant_name: tenantName,
          legal_entity_name: legalEntityName,
          email_signature: signature,
        });

        const info = await transporter.sendMail({
          from: fromHeader,
          to: recipient.recipient_email,
          subject,
          html,
        });

        await adminClient
          .from("message_campaign_recipients")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
            message_id: info.messageId,
          })
          .eq("id", recipient.id);

        sentCount++;

        // Log to email_logs too
        await adminClient.from("email_logs").insert({
          tenant_id: tenantId,
          recipient_email: recipient.recipient_email,
          recipient_user_id: recipient.user_id,
          application_event: "campaign_message",
          subject,
          status: "sent",
          message_id: info.messageId,
          metadata: { campaign_id: campaignId },
        });

        console.log(`[campaign] Sent to ${recipient.recipient_email} (${sentCount}/${recipients.length})`);
      } catch (err: any) {
        failedCount++;
        await adminClient
          .from("message_campaign_recipients")
          .update({
            status: "failed",
            error_message: err.message,
          })
          .eq("id", recipient.id);

        await adminClient.from("email_logs").insert({
          tenant_id: tenantId,
          recipient_email: recipient.recipient_email,
          recipient_user_id: recipient.user_id,
          application_event: "campaign_message",
          subject: template.subject,
          status: "failed",
          error_message: err.message,
          metadata: { campaign_id: campaignId },
        });

        console.error(`[campaign] Failed for ${recipient.recipient_email}: ${err.message}`);
      }

      // Update campaign counters
      await adminClient
        .from("message_campaigns")
        .update({
          sent_count: sentCount,
          failed_count: failedCount,
          current_batch: batchNumber,
        })
        .eq("id", campaignId);

      // Delay between emails
      await sleep(DELAY_BETWEEN_EMAILS_MS);
    }

    // Check if there are more batches
    const { count: pendingCount } = await adminClient
      .from("message_campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("status", "pending");

    if (pendingCount && pendingCount > 0) {
      // Schedule next batch after 1 hour delay
      const nextBatchAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      await adminClient
        .from("message_campaigns")
        .update({ next_batch_at: nextBatchAt, current_batch: batchNumber + 1 })
        .eq("id", campaignId);

      // Wait 1 hour then send next batch
      console.log(`[campaign] Batch ${batchNumber} complete. Waiting 1 hour for next batch...`);
      await sleep(60 * 60 * 1000);
      await sendBatchBackground(adminClient, campaignId, tenantId, templateId, batchNumber + 1);
    } else {
      // All done
      await adminClient
        .from("message_campaigns")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", campaignId);
      console.log(`[campaign] Campaign ${campaignId} completed!`);
    }
  } catch (err: any) {
    console.error(`[campaign] Batch error: ${err.message}`);
    await adminClient
      .from("message_campaigns")
      .update({ status: "failed" })
      .eq("id", campaignId);
  }
}
