// Minimal production server for Cloud Run / any container host.
// Serves the Vite build from /dist and listens on process.env.PORT.
// For social crawlers on tenant subdomains, proxy to the tenant-og backend so
// shared links use tenant-specific title, description, and logo.
import express from "express";
import compression from "compression";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, "dist");
const PROD_DOMAINS = ["myco-op.co.za", "mycoop.co.za"];
const BOT_UA_REGEX = /(facebookexternalhit|facebot|twitterbot|xbot|slackbot|linkedinbot|whatsapp|telegrambot|discordbot|skypeuripreview|googlebot|bingbot|applebot|iMessagePreview)/i;
const TENANT_OG_URL = process.env.TENANT_OG_URL || "https://yhzajyegudbecyjpznjr.supabase.co/functions/v1/tenant-og";

function getTenantSlugFromHost(host = "") {
  const normalized = host.split(":")[0].toLowerCase();
  for (const domain of PROD_DOMAINS) {
    if (normalized.endsWith(`.${domain}`)) {
      const sub = normalized.slice(0, -(domain.length + 1));
      if (sub && sub !== "www") return sub.split(".").pop() || null;
    }
  }
  return null;
}

function isSocialCrawler(userAgent = "") {
  return BOT_UA_REGEX.test(userAgent);
}

const app = express();
app.use(compression());

app.get("/healthz", (_req, res) => res.status(200).send("ok"));

app.get("*", async (req, res, next) => {
  try {
    const slug = getTenantSlugFromHost(req.headers.host);
    const userAgent = String(req.headers["user-agent"] || "");

    if (slug && isSocialCrawler(userAgent)) {
      const ogUrl = `${TENANT_OG_URL}?slug=${encodeURIComponent(slug)}`;
      const ogRes = await fetch(ogUrl, {
        headers: {
          "user-agent": userAgent,
          "x-forwarded-host": String(req.headers.host || ""),
        },
      });

      const html = await ogRes.text();
      res.status(ogRes.status);
      res.setHeader("Content-Type", ogRes.headers.get("content-type") || "text/html; charset=utf-8");
      res.setHeader("Cache-Control", ogRes.headers.get("cache-control") || "public, max-age=600, s-maxage=600");
      return res.send(html);
    }

    return next();
  } catch (error) {
    return next(error);
  }
});

// Static assets with long cache for hashed files
app.use(
  express.static(distDir, {
    maxAge: "1y",
    setHeaders: (res, filePath) => {
      if (filePath.endsWith("index.html")) {
        res.setHeader("Cache-Control", "no-cache");
      }
    },
  }),
);

// SPA fallback — let React Router handle all other routes
app.get("*", (_req, res) => {
  res.sendFile(path.join(distDir, "index.html"));
});

const port = Number(process.env.PORT) || 8080;
app.listen(port, "0.0.0.0", () => {
  console.log(`Server listening on 0.0.0.0:${port}`);
});
