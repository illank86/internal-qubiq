import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { env } from "@/lib/env";

/**
 * Where the sign-in is kept. Unless "Keep me signed in on this device" was
 * ticked (it is off by default), it lives in session storage and ends when
 * the browser closes; ticked, it is kept in local storage across restarts.
 * Storage can be blocked (private windows), so every access is guarded.
 */
const REMEMBER_KEY = "qubiq-internal-remember";

function safe<T>(work: () => T, fallback: T): T {
  try {
    return work();
  } catch {
    return fallback;
  }
}

export function setRememberDevice(remember: boolean) {
  safe(() => localStorage.setItem(REMEMBER_KEY, remember ? "1" : "0"), undefined);
}
// Off unless ticked at sign-in: a sign-in ends when the browser closes.
export const remembersDevice = () => safe(() => localStorage.getItem(REMEMBER_KEY) === "1", false);

const authStorage = {
  getItem: (key: string) => safe(() => sessionStorage.getItem(key) ?? localStorage.getItem(key), null),
  setItem: (key: string, value: string) =>
    safe(() => {
      const keep = remembersDevice();
      (keep ? localStorage : sessionStorage).setItem(key, value);
      (keep ? sessionStorage : localStorage).removeItem(key);
    }, undefined),
  removeItem: (key: string) =>
    safe(() => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    }, undefined),
};

/**
 * The one Supabase client. The same project and the same accounts as the
 * website; the session lives in this app's own storage, so signing in here
 * does not sign anyone in on goqubiq.com, and the reverse.
 *
 * Authorisation is the database's: row-level security and the permission
 * checks inside each RPC decide what a staff member may read or change. The
 * checks in this app only decide what to show.
 */
export const supabase = createClient<Database>(env.supabaseUrl, env.supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Links in our auth emails carry token_hash; /set-password verifies them.
    detectSessionInUrl: true,
    flowType: "pkce",
    storageKey: "qubiq-internal-auth",
    storage: authStorage,
  },
});
