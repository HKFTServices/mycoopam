import fs from "node:fs/promises";
import path from "node:path";

const API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";

if (!API_KEY) {
  console.error("Missing OPENAI_API_KEY. Set it in your shell (do not paste it into client code).");
  console.error("Example: OPENAI_API_KEY=... node scripts/generate-tenant-login-images.mjs");
  process.exit(1);
}

const outDir = path.join(process.cwd(), "public", "auth");
const size = process.env.OPENAI_IMAGE_SIZE || "1536x1024";
const quality = process.env.OPENAI_IMAGE_QUALITY || "high";
const outputFormat = process.env.OPENAI_IMAGE_FORMAT || "jpeg";

const slides = [
  {
    filename: "tenant-slide-1.jpg",
    prompt:
      "Photorealistic marketing hero photo: confident South African woman holding a smartphone, smiling subtly, modern cooperative office background, warm natural light, premium fintech aesthetic. The phone screen shows an abstract finance dashboard with charts, balances, and gold/silver allocation cards. No readable text, no logos, no brand names.",
  },
  {
    filename: "tenant-slide-2.jpg",
    prompt:
      "Photorealistic marketing hero photo: cooperative admin team reviewing approvals on a laptop in a modern workspace, subtle notification glow, premium fintech look. Laptop screen shows an abstract approval queue, notifications, and an audit trail timeline. No readable text, no logos, no brand names.",
  },
  {
    filename: "tenant-slide-3.jpg",
    prompt:
      "Photorealistic marketing hero photo: close-up hands holding a phone and a payment device, representing debit orders and loan applications, with subtle gold and silver elements (coins/bars) in background bokeh, premium fintech lighting. No readable text, no logos, no brand names.",
  },
];

async function generateImage(prompt) {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      prompt,
      size,
      quality,
      output_format: outputFormat,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenAI images API error (${res.status}): ${text || res.statusText}`);
  }

  const json = await res.json();
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error("No b64_json returned. Try setting response_format or using a supported image model.");
  }
  return Buffer.from(b64, "base64");
}

await fs.mkdir(outDir, { recursive: true });

for (const slide of slides) {
  const outPath = path.join(outDir, slide.filename);
  console.log(`Generating ${slide.filename} (${size}, ${quality}, ${outputFormat})...`);
  const buf = await generateImage(slide.prompt);
  await fs.writeFile(outPath, buf);
  console.log(`Wrote ${outPath}`);
}

console.log("Done. Reload the app; TenantLanding will use the JPGs and fall back to SVGs if missing.");
