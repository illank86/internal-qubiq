import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { env } from "@/lib/env";

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
  },
});
