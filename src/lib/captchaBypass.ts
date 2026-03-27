const PREFIX = "captchaBypassUntil";

function key(scope: string, email: string) {
  const normalized = email.trim().toLowerCase();
  return `${PREFIX}:${scope}:${normalized}`;
}

export function getCaptchaBypassUntil(scope: string, email: string): number | null {
  if (!email.trim()) return null;
  try {
    const raw = localStorage.getItem(key(scope, email));
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function setCaptchaBypass(scope: string, email: string, hours = 5) {
  if (!email.trim()) return;
  const until = Date.now() + hours * 60 * 60 * 1000;
  try {
    localStorage.setItem(key(scope, email), String(until));
  } catch {
    // ignore
  }
}

export function clearCaptchaBypass(scope: string, email: string) {
  if (!email.trim()) return;
  try {
    localStorage.removeItem(key(scope, email));
  } catch {
    // ignore
  }
}

