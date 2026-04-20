// Verifies a "normal" reCAPTCHA token (v2 checkbox / invisible) via
// Google's siteverify endpoint.
// Returns { success, hostname, challenge_ts, error_codes? } or { success: false, error }.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RECAPTCHA_SECRET_KEY = (Deno.env.get("6LfgbsEsAAAAADBslhiSBUJAzl1BFkne5W5335r4") ?? "").trim();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!RECAPTCHA_SECRET_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: "reCAPTCHA not configured on server (missing secret)" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json().catch(() => ({}));
    const token = typeof body?.token === "string" ? body.token : "";

    if (!token) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing token" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const params = new URLSearchParams();
    params.set("secret", RECAPTCHA_SECRET_KEY);
    params.set("response", token);

    const verifyRes = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    const data = await verifyRes.json();
    if (!verifyRes.ok) {
      console.error("[verify-recaptcha] Google siteverify error:", data);
      return new Response(
        JSON.stringify({ success: false, error: "Verification failed" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        success: !!data?.success,
        hostname: data?.hostname ?? null,
        challenge_ts: data?.challenge_ts ?? null,
        error_codes: data?.["error-codes"] ?? [],
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[verify-recaptcha] Error:", err?.message ?? err);
    return new Response(
      JSON.stringify({ success: false, error: err?.message ?? "Unexpected error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
