/**
 * Shared email helpers for all edge functions.
 * 
 * SMTP Resolution Order (consistent across ALL email types):
 *   1. Tenant SMTP (tenant_configuration) — always preferred
 *   2. Head Office SMTP (head_office_settings table)
 *   3. Global ENV secrets (GLOBAL_SMTP_*)
 * 
 * URL Building:
 *   All tenant links use: https://{slug}.{PROD_DOMAIN}/{path}
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "https://esm.sh/nodemailer@6.9.10";

// ─── Constants ───────────────────────────────────────────────────────────────

const PROD_DOMAIN = Deno.env.get("PROD_DOMAIN") || "myco-op.co.za";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── URL Helpers ─────────────────────────────────────────────────────────────

/**
 * Build the canonical tenant URL for use in email links.
 * Always returns the production subdomain URL.
 */
export function buildTenantUrl(tenantSlug: string | null | undefined, path = ""): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  if (tenantSlug) {
    return `https://${tenantSlug}.${PROD_DOMAIN}${cleanPath === "/" ? "" : cleanPath}`;
  }
  return `https://www.${PROD_DOMAIN}${cleanPath === "/" ? "" : cleanPath}`;
}

// ─── SMTP Types ──────────────────────────────────────────────────────────────

export interface SmtpConfig {
  host: string;
  port: number | null;
  username: string | null;
  password: string | null;
  fromEmail: string;
  fromName: string | null;
  source: "tenant" | "head_office" | "global_env";
}

// ─── SMTP Resolution ────────────────────────────────────────────────────────

/**
 * Resolve SMTP settings using the standard 3-tier fallback:
 *   1. Tenant config (tenant_configuration table)
 *   2. Head Office settings (head_office_settings table)
 *   3. Global environment secrets (GLOBAL_SMTP_*)
 * 
 * @param adminClient - Supabase client with service role key
 * @param tenantId - The tenant ID to resolve SMTP for
 * @param tenantConfig - Optional pre-fetched tenant_configuration row (avoids re-query)
 * @returns SmtpConfig or null if no SMTP is configured anywhere
 */
export async function resolveSmtp(
  adminClient: any,
  tenantId: string,
  tenantConfig?: any | null,
): Promise<SmtpConfig | null> {
  // 1. Tenant SMTP (only if use_global_email_settings is false)
  if (!tenantConfig) {
    const { data } = await adminClient
      .from("tenant_configuration")
      .select("smtp_host, smtp_port, smtp_username, smtp_password, smtp_from_email, smtp_from_name, use_global_email_settings")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    tenantConfig = data;
  }

  const useGlobal = tenantConfig?.use_global_email_settings ?? true;

  if (!useGlobal && tenantConfig?.smtp_host && tenantConfig?.smtp_from_email) {
    console.log(`[resolveSmtp] Using tenant SMTP: ${tenantConfig.smtp_host}`);
    return {
      host: tenantConfig.smtp_host,
      port: tenantConfig.smtp_port ?? null,
      username: tenantConfig.smtp_username ?? null,
      password: tenantConfig.smtp_password ?? null,
      fromEmail: tenantConfig.smtp_from_email,
      fromName: tenantConfig.smtp_from_name ?? null,
      source: "tenant",
    };
  }

  // 2. Head Office settings from DB
  const { data: hoSettings } = await adminClient
    .from("head_office_settings")
    .select("smtp_host, smtp_port, smtp_username, smtp_password, smtp_from_email, smtp_from_name, company_name")
    .limit(1)
    .maybeSingle();

  if (hoSettings?.smtp_host && hoSettings?.smtp_from_email) {
    console.log(`[resolveSmtp] Using head office SMTP: ${hoSettings.smtp_host}`);
    return {
      host: hoSettings.smtp_host,
      port: hoSettings.smtp_port ?? null,
      username: hoSettings.smtp_username ?? null,
      password: hoSettings.smtp_password ?? null,
      fromEmail: hoSettings.smtp_from_email,
      fromName: hoSettings.smtp_from_name || hoSettings.company_name || null,
      source: "head_office",
    };
  }

  // 3. Global environment secrets
  const envHost = Deno.env.get("GLOBAL_SMTP_HOST");
  const envUsername = Deno.env.get("GLOBAL_SMTP_USERNAME");
  if (envHost && envUsername) {
    console.log(`[resolveSmtp] Using global env SMTP: ${envHost}`);
    return {
      host: envHost,
      port: parseInt(Deno.env.get("GLOBAL_SMTP_PORT") || "587", 10),
      username: envUsername,
      password: Deno.env.get("GLOBAL_SMTP_PASSWORD") || "",
      fromEmail: envUsername,
      fromName: Deno.env.get("GLOBAL_SMTP_FROM_NAME") || hoSettings?.company_name || null,
      source: "global_env",
    };
  }

  console.warn("[resolveSmtp] No SMTP configured in tenant, head office, or env secrets");
  return null;
}

// ─── SMTP Transport ──────────────────────────────────────────────────────────

/**
 * Create a verified nodemailer transporter using multi-port fallback strategy.
 * Tries: 465 (implicit TLS) → 587 (STARTTLS) → 587 (plain) → 25 (plain)
 */
export async function createSmtpTransporter(smtp: SmtpConfig): Promise<any | null> {
  const strategies = [
    { port: 465, secure: true,  ignoreTLS: false },
    { port: 587, secure: false, ignoreTLS: false },
    { port: 587, secure: false, ignoreTLS: true  },
    { port: 25,  secure: false, ignoreTLS: true  },
  ];

  for (const s of strategies) {
    try {
      const t = nodemailer.createTransport({
        host: smtp.host,
        port: s.port,
        secure: s.secure,
        ignoreTLS: s.ignoreTLS,
        tls: { rejectUnauthorized: false },
        auth: smtp.username ? { user: smtp.username, pass: smtp.password || "" } : undefined,
      });
      await t.verify();
      console.log(`[createSmtpTransporter] Connected via ${smtp.host}:${s.port}`);
      return t;
    } catch (err: any) {
      console.log(`[createSmtpTransporter] ${smtp.host}:${s.port} failed: ${err.message}`);
      if (/534|535/.test(err.message)) break; // Auth error, don't try plain
    }
  }

  return null;
}

/**
 * Build the "From" header string from SMTP config.
 */
export function buildFromHeader(smtp: SmtpConfig): string {
  // If smtp_username looks like an email, use it as actual sender
  // (many SMTP servers reject sending from a different address)
  const isSmtpUserEmail = smtp.username?.includes("@");
  const effectiveFromEmail = isSmtpUserEmail ? smtp.username! : smtp.fromEmail;
  return smtp.fromName
    ? `"${smtp.fromName}" <${effectiveFromEmail}>`
    : effectiveFromEmail;
}

// ─── Tenant Display Name ────────────────────────────────────────────────────

/**
 * Resolve tenant display name: prefer legal entity name over tenant.name.
 */
export async function resolveTenantDisplayName(
  adminClient: any,
  tenantId: string,
  tenantConfig?: any | null,
): Promise<string> {
  // If tenantConfig has legal_entity_id, use the legal entity name
  if (tenantConfig?.legal_entity_id) {
    const { data: legalEntity } = await adminClient
      .from("entities")
      .select("name")
      .eq("id", tenantConfig.legal_entity_id)
      .single();
    if (legalEntity?.name) return legalEntity.name;
  }

  // Fall back to tenant.name
  const { data: tenant } = await adminClient
    .from("tenants")
    .select("name")
    .eq("id", tenantId)
    .single();

  return tenant?.name || "the cooperative";
}

// ─── Email Signature ─────────────────────────────────────────────────────────

/**
 * Resolve email signature based on user language.
 */
export function resolveEmailSignature(tenantConfig: any, lang: string): string {
  if (!tenantConfig) return "";
  return lang === "af"
    ? (tenantConfig.email_signature_af || tenantConfig.email_signature_en || "")
    : (tenantConfig.email_signature_en || "");
}
