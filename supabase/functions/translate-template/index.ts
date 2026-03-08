import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { subject, body_html } = await req.json();

    if (!subject && !body_html) {
      return new Response(JSON.stringify({ error: "No content to translate" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const prompt = `You are a professional English-to-Afrikaans translator. Translate the following email template content from English to Afrikaans. 

IMPORTANT RULES:
- Preserve ALL HTML tags exactly as they are (do not translate HTML attributes or tag names)
- Preserve ALL merge field placeholders exactly as they are (e.g. {{account_number}}, {{entity_name}}, {{user_name}}, {{user_surname}}, {{tenant_name}}, etc.)
- Only translate the visible text content
- Maintain the same tone and formality
- Return ONLY a JSON object with "subject" and "body_html" keys, no other text

English Subject: ${subject || "(empty)"}

English Body HTML:
${body_html || "(empty)"}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are a professional translator. Always respond with valid JSON only." },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`AI gateway error: ${response.status} ${errText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Extract JSON from the response (handle markdown code blocks)
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    const translated = JSON.parse(jsonStr);

    return new Response(JSON.stringify({
      subject_af: translated.subject || "",
      body_html_af: translated.body_html || "",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Translation error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
