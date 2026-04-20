// Minimal production server for Cloud Run / any container host.
// Serves the Vite build from /dist and listens on process.env.PORT.
import express from "express";
import compression from "compression";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, "dist");

const app = express();
app.use(compression());

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

// Health check for Cloud Run
app.get("/healthz", (_req, res) => res.status(200).send("ok"));

// SPA fallback — let React Router handle all other routes
app.get("*", (_req, res) => {
  res.sendFile(path.join(distDir, "index.html"));
});

const port = Number(process.env.PORT) || 8080;
app.listen(port, "0.0.0.0", () => {
  console.log(`Server listening on 0.0.0.0:${port}`);
});
