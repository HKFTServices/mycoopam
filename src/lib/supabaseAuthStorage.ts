type AuthStorageMode = "local" | "session";

const MODE_KEY = "authStorageMode";
const REMEMBER_ISSUED_AT_KEY = "rememberMeIssuedAt";

function nowMs() {
  return Date.now();
}

function safeGetLocalStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function safeGetSessionStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

function safeGetMode(): AuthStorageMode {
  const ls = safeGetLocalStorage();
  const raw = ls?.getItem(MODE_KEY);
  return raw === "session" ? "session" : "local";
}

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return Array.from(map.keys())[index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  } as Storage;
}

const fallbackStorage = memoryStorage();

function getActiveStorage(): Storage {
  const mode = safeGetMode();
  const storage = mode === "session" ? safeGetSessionStorage() : safeGetLocalStorage();
  return storage ?? fallbackStorage;
}

function forEachKey(storage: Storage, fn: (key: string) => void) {
  for (let i = storage.length - 1; i >= 0; i -= 1) {
    const k = storage.key(i);
    if (!k) continue;
    fn(k);
  }
}

function clearSupabaseAuthTokens(storage: Storage) {
  forEachKey(storage, (k) => {
    // Supabase JS uses `sb-<project-ref>-auth-token` by default.
    if (k.startsWith("sb-") && k.endsWith("-auth-token")) storage.removeItem(k);
  });
}

export function setAuthStorageMode(mode: AuthStorageMode) {
  const ls = safeGetLocalStorage();
  const ss = safeGetSessionStorage();
  ls?.setItem(MODE_KEY, mode);

  // Avoid showing a "previous session" when switching modes.
  if (mode === "session") clearSupabaseAuthTokens(ls ?? fallbackStorage);
  if (mode === "local") clearSupabaseAuthTokens(ss ?? fallbackStorage);
}

export function getAuthStorageMode(): AuthStorageMode {
  return safeGetMode();
}

export function markRememberMeIssuedAt() {
  safeGetLocalStorage()?.setItem(REMEMBER_ISSUED_AT_KEY, String(nowMs()));
}

export function clearRememberMeIssuedAt() {
  safeGetLocalStorage()?.removeItem(REMEMBER_ISSUED_AT_KEY);
}

export function cleanupExpiredRememberMe(maxAgeDays = 30) {
  const ls = safeGetLocalStorage();
  const ss = safeGetSessionStorage();
  const issuedAtRaw = ls?.getItem(REMEMBER_ISSUED_AT_KEY);
  if (!issuedAtRaw) return;
  const issuedAt = Number(issuedAtRaw);
  if (Number.isNaN(issuedAt)) {
    ls?.removeItem(REMEMBER_ISSUED_AT_KEY);
    return;
  }

  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  if (nowMs() - issuedAt <= maxAgeMs) return;

  // Expired: clear session tokens from both stores and remove marker.
  clearSupabaseAuthTokens(ls ?? fallbackStorage);
  clearSupabaseAuthTokens(ss ?? fallbackStorage);
  ls?.removeItem(REMEMBER_ISSUED_AT_KEY);
}

export const supabaseAuthStorage: Storage = {
  get length() {
    return getActiveStorage().length;
  },
  clear() {
    getActiveStorage().clear();
  },
  getItem(key: string) {
    return getActiveStorage().getItem(key);
  },
  key(index: number) {
    return getActiveStorage().key(index);
  },
  removeItem(key: string) {
    getActiveStorage().removeItem(key);
  },
  setItem(key: string, value: string) {
    getActiveStorage().setItem(key, value);
  },
};

