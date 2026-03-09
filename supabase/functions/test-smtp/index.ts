import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.10";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { smtp_host, smtp_port, smtp_username, smtp_password, smtp_from_email, smtp_from_name, smtp_enable_ssl, to_email } = await req.json();

    if (!smtp_host || !smtp_from_email || !to_email) {
      return new Response(JSON.stringify({ error: "Missing required SMTP fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Deno's native TLS can cause "write UNKNOWN" with STARTTLS on port 587.
    // Try the user-requested port first, then fall back to port 465 (implicit TLS)
    // or port 587 (STARTTLS) depending on what was requested.
    const requestedPort = smtp_port || 587;
    const portStrategies = requestedPort === 465
      ? [{ port: 465, secure: true }, { port: 587, secure: false }]
      : [{ port: 587, secure: false }, { port: 465, secure: true }];

    let transporter: any = null;
    let lastError: any = null;

    for (const strategy of portStrategies) {
      console.log(`[test-smtp] Trying ${smtp_host}:${strategy.port} (secure=${strategy.secure})`);
      try {
        transporter = nodemailer.createTransport({
          host: smtp_host,
          port: strategy.port,
          secure: strategy.secure,
          tls: { rejectUnauthorized: false },
          auth: smtp_username ? {
            user: smtp_username,
            pass: smtp_password || "",
          } : undefined,
          connectionTimeout: 10000,
          greetingTimeout: 10000,
        });
        // Verify connection works
        await transporter.verify();
        console.log(`[test-smtp] Connected successfully on port ${strategy.port}`);
        lastError = null;
        break;
      } catch (err: any) {
        console.warn(`[test-smtp] Port ${strategy.port} failed: ${err.message}`);
        lastError = err;
        transporter = null;
      }
    }

    if (!transporter) {
      throw new Error(`Could not connect to SMTP server. Last error: ${lastError?.message}`);
    }

    const isSmtpUserEmail = smtp_username?.includes("@");
    const effectiveFromEmail = isSmtpUserEmail ? smtp_username : smtp_from_email;
    const fromHeader = smtp_from_name ? `"${smtp_from_name}" <${effectiveFromEmail}>` : effectiveFromEmail;

    const info = await transporter.sendMail({
      from: fromHeader,
      to: to_email,
      subject: "SMTP Test Email",
      html: `<div style="font-family:sans-serif;padding:20px"><h2>SMTP Test Successful</h2><p>This confirms your SMTP settings are working correctly.</p><p style="color:#888;font-size:12px">Sent from Tenant Configuration</p></div>`,
    });

    console.log(`[test-smtp] Email sent: ${info.messageId}`);

    return new Response(JSON.stringify({ success: true, messageId: info.messageId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error(`[test-smtp] Error: ${error.message}`);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
