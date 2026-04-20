// reCAPTCHA Enterprise helper: executes the client-side challenge and
// verifies the resulting token via our edge function. Returns true if the
// request looks human (score >= server threshold), false otherwise.
import { supabase } from "@/integrations/supabase/client";

const DEFAULT_SITE_KEY = "6LffpcAsAAAAAMKSu5wnJsJ4gvNO1YlKUkZAgYmQ";
export const RECAPTCHA_SITE_KEY = (import.meta.env.VITE_RECAPTCHA_SITE_KEY || DEFAULT_SITE_KEY).trim();

const FAIL_OPEN =
  import.meta.env.DEV || String(import.meta.env.VITE_RECAPTCHA_FAIL_OPEN || "").toLowerCase() === "true";

declare global {
  interface Window {
    grecaptcha?: {
      enterprise: {
        ready: (cb: () => void) => void;
        execute: (siteKey: string, opts: { action: string }) => Promise<string>;
      };
    };
  }
}

/** Inject the grecaptcha enterprise script if not already present. */
const ensureScriptInjected = () => {
  if (typeof document === "undefined") return;
  const existing = document.querySelector<HTMLScriptElement>('script[data-recaptcha="enterprise"]');
  const anyEnterpriseScript = document.querySelector<HTMLScriptElement>('script[src*="recaptcha/enterprise.js"]');
  if (existing || anyEnterpriseScript) return;
  const s = document.createElement("script");
  s.src = `https://www.google.com/recaptcha/enterprise.js?render=${RECAPTCHA_SITE_KEY}`;
  s.async = true;
  s.defer = true;
  s.dataset.recaptcha = "enterprise";
  document.head.appendChild(s);
};

/** Wait for the grecaptcha enterprise script to finish loading. */
const waitForGrecaptcha = (timeoutMs = 15000): Promise<void> =>
  new Promise((resolve, reject) => {
    ensureScriptInjected();
    const start = Date.now();
    const tick = () => {
      if (window.grecaptcha?.enterprise?.execute) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error("reCAPTCHA failed to load"));
      setTimeout(tick, 100);
    };
    tick();
  });

/**
 * Run reCAPTCHA Enterprise for an action.
 * Returns `true` when the server-side assessment succeeds (score >= threshold),
 * otherwise returns `false`.
 *
 * For local dev and explicit overrides, set `VITE_RECAPTCHA_FAIL_OPEN="true"`
 * to avoid blocking flows when reCAPTCHA isn't configured.
 */
export const runRecaptcha = async (action: string): Promise<boolean> => {
  try {
    if (!RECAPTCHA_SITE_KEY) {
      console.warn("[recaptcha] missing site key");
      return FAIL_OPEN;
    }

    await waitForGrecaptcha();
    const token = await new Promise<string>((resolve, reject) => {
      window.grecaptcha!.enterprise.ready(() => {
        window.grecaptcha!.enterprise
          .execute(RECAPTCHA_SITE_KEY, { action })
          .then(resolve)
          .catch(reject);
      });
    });

    const { data, error } = await supabase.functions.invoke("verify-recaptcha", {
      body: { token, action },
    });
    if (error) {
      console.warn("[recaptcha] verify error:", error.message);
      return FAIL_OPEN;
    }
    if (!data?.success) {
      console.warn("[recaptcha] low score / failed:", data);
      return false;
    }
    return true;
  } catch (err: any) {
    console.warn("[recaptcha] exception:", err?.message ?? err);
    return FAIL_OPEN;
  }
};
