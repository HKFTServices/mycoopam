// Verifies a reCAPTCHA Enterprise token against Google's Assessment API.
// Returns { success, score, action, reasons } or { success: false, error }.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RECAPTCHA_API_KEY = Deno.env.get("RECAPTCHA_API_KEY") ?? "";
const RECAPTCHA_PROJECT_ID = Deno.env.get("RECAPTCHA_PROJECT_ID") ?? "";
const SITE_KEY = "6LffpcAsAAAAAMKSu5wnJsJ4gvNO1YlKUkZAgYmQ";
// Block requests scoring below this threshold (0.0 = bot, 1.0 = human).
const MIN_SCORE = 0.5;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!RECAPTCHA_API_KEY || !RECAPTCHA_PROJECT_ID) {
      return new Response(
        JSON.stringify({ success: false, error: "reCAPTCHA not configured on server" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json().catch(() => ({}));
    const token = typeof body?.token === "string" ? body.token : "";
    const action = typeof body?.action === "string" ? body.action : "";

    if (!token || !action) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing token or action" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const url = `https://recaptchaenterprise.googleapis.com/v1/projects/${RECAPTCHA_PROJECT_ID}/assessments?key=${RECAPTCHA_API_KEY}`;
    const assessRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: { token, siteKey: SITE_KEY, expectedAction: action },
      }),
    });

    const data = await assessRes.json();
    if (!assessRes.ok) {
      console.error("[verify-recaptcha] Google API error:", data);
      return new Response(
        JSON.stringify({ success: false, error: data?.error?.message ?? "Assessment failed" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const tokenProps = data?.tokenProperties ?? {};
    if (!tokenProps.valid) {
      return new Response(
        JSON.stringify({ success: false, error: `Invalid token: ${tokenProps.invalidReason ?? "unknown"}` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (tokenProps.action && tokenProps.action !== action) {
      return new Response(
        JSON.stringify({ success: false, error: "Action mismatch" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const score = data?.riskAnalysis?.score ?? 0;
    const reasons = data?.riskAnalysis?.reasons ?? [];
    const success = score >= MIN_SCORE;

    return new Response(
      JSON.stringify({ success, score, action: tokenProps.action, reasons }),
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
