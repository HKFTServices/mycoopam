// "Normal" reCAPTCHA helper (v2 checkbox) for a React + Supabase Edge Function app.
// - Frontend renders the checkbox and obtains a token.
// - Backend verifies token via https://www.google.com/recaptcha/api/siteverify.
import { supabase } from "@/integrations/supabase/client";

export const RECAPTCHA_SITE_KEY = (import.meta.env.VITE_RECAPTCHA_SITE_KEY || "").trim();

export const RECAPTCHA_FAIL_OPEN =
  import.meta.env.DEV || String(import.meta.env.VITE_RECAPTCHA_FAIL_OPEN || "").toLowerCase() === "true";

/** Inject the reCAPTCHA v2 script if not already present. */
const ensureV2ScriptInjected = () => {
  if (typeof document === "undefined") return;
  const existing = document.querySelector<HTMLScriptElement>('script[data-recaptcha="v2"]');
  const anyV2 = document.querySelector<HTMLScriptElement>('script[src*="google.com/recaptcha/api.js"]');
  if (existing || anyV2) return;
  const s = document.createElement("script");
  s.src = "https://www.google.com/recaptcha/api.js?render=explicit";
  s.async = true;
  s.defer = true;
  s.dataset.recaptcha = "v2";
  document.head.appendChild(s);
};

/** Wait for the v2 grecaptcha script to load. */
export const waitForGrecaptchaV2 = (timeoutMs = 15000): Promise<void> =>
  new Promise((resolve, reject) => {
    ensureV2ScriptInjected();
    const start = Date.now();
    const tick = () => {
      if (window.grecaptcha?.render) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error("reCAPTCHA failed to load"));
      setTimeout(tick, 100);
    };
    tick();
  });

/** Verify a client token via the `verify-recaptcha` edge function. */
export async function verifyRecaptchaToken(token: string | null): Promise<boolean> {
  if (!token) return RECAPTCHA_FAIL_OPEN;
  try {
    const { data, error } = await supabase.functions.invoke("verify-recaptcha", {
      body: { token },
    });
    if (error) {
      console.warn("[recaptcha] verify error:", error.message);
      return RECAPTCHA_FAIL_OPEN;
    }
    if (!data?.success) {
      console.warn("[recaptcha] verify failed:", data);
      return false;
    }
    return true;
  } catch (err: any) {
    console.warn("[recaptcha] exception:", err?.message ?? err);
    return RECAPTCHA_FAIL_OPEN;
  }
}
