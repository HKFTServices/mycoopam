import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    const body = await req.json();
    const { phone, action, code } = body;

    if (!phone) {
      return new Response(JSON.stringify({ error: "Phone number is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);

    if (action === "send") {
      // Generate 6-digit OTP
      const otpCode = String(Math.floor(100000 + Math.random() * 900000));
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      // Delete old unverified OTPs for this user
      await adminClient
        .from("otp_verifications")
        .delete()
        .eq("user_id", userId)
        .eq("verified", false);

      // Insert new OTP
      const { error: insertErr } = await adminClient
        .from("otp_verifications")
        .insert({ user_id: userId, phone, code: otpCode, expires_at: expiresAt });

      if (insertErr) throw insertErr;

      // Read SMS Portal credentials from system_settings
      const { data: smsClientIdSetting } = await adminClient
        .from("system_settings")
        .select("value")
        .eq("key", "SMS_CLIENT_ID")
        .single();

      const { data: smsKeySetting } = await adminClient
        .from("system_settings")
        .select("value")
        .eq("key", "SMS_API_KEY")
        .single();

      if (!smsClientIdSetting?.value || !smsKeySetting?.value) {
        console.log(`[OTP] Code for ${phone}: ${otpCode} (SMS not configured)`);
        return new Response(
          JSON.stringify({ success: true, message: "OTP generated (SMS not configured - check backend logs)" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // SMS Portal: Basic auth = base64(clientId:secret)
      const base64Creds = btoa(`${smsClientIdSetting.value}:${smsKeySetting.value}`);

      // Get auth token
      const authRes = await fetch("https://rest.smsportal.com/Authentication", {
        method: "POST",
        headers: { Authorization: `Basic ${base64Creds}` },
      });

      if (!authRes.ok) {
        const errBody = await authRes.text();
        throw new Error(`SMS Portal auth failed [${authRes.status}]: ${errBody}`);
      }

      const authData = await authRes.json();

      // Send SMS
      const smsRes = await fetch("https://rest.smsportal.com/v3/BulkMessages", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authData.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [{
            destination: phone.replace(/[^0-9+]/g, ""),
            content: `Your verification code is: ${otpCode}. It expires in 10 minutes.`,
          }],
        }),
      });

      if (!smsRes.ok) {
        const errBody = await smsRes.text();
        throw new Error(`SMS Portal send failed [${smsRes.status}]: ${errBody}`);
      }

      return new Response(
        JSON.stringify({ success: true, message: "OTP sent successfully" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "verify") {
      if (!code) {
        return new Response(JSON.stringify({ error: "Code is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: otp } = await adminClient
        .from("otp_verifications")
        .select("*")
        .eq("user_id", userId)
        .eq("phone", phone)
        .eq("code", code)
        .eq("verified", false)
        .gte("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (!otp) {
        return new Response(
          JSON.stringify({ success: false, error: "Invalid or expired code" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Mark as verified
      await adminClient
        .from("otp_verifications")
        .update({ verified: true })
        .eq("id", otp.id);

      return new Response(
        JSON.stringify({ success: true, verified: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Invalid action. Use 'send' or 'verify'" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    console.error("OTP error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
