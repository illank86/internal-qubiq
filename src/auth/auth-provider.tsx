import { useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { AppPermission, AppRole } from "@/lib/types";
import { AuthContext, NOT_STAFF_NOTICE, type AuthState, type Staff } from "./use-auth";

/**
 * Who is signed in, and whether they are staff.
 *
 * This app has no sign-up: staff arrive by invitation (the invite-user edge
 * function) and set a password from the email. Customers' accounts are the
 * same Supabase accounts, so a customer could sign in here — they are told
 * this app is for the team and signed straight out. The database would show
 * them nothing anyway; this is about a clear answer, not security.
 */

/** Staff only: an internal account that may open the admin. */
async function loadStaff(session: Session): Promise<Staff | null> {
  const [{ data: profile }, { data: roles }, { data: permissions }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle(),
    supabase.rpc("current_user_roles"),
    supabase.rpc("current_user_permissions"),
  ]);
  const granted = (permissions ?? []) as AppPermission[];
  if (profile?.user_type !== "internal" || !granted.includes("admin.access")) return null;
  return {
    id: session.user.id,
    email: session.user.email ?? "",
    profile,
    roles: (roles ?? []) as AppRole[],
    permissions: granted,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  const signOut = useCallback(async (notice?: string) => {
    await supabase.auth.signOut();
    setState({ status: "signed-out", notice });
  }, []);

  const resolve = useCallback(
    async (session: Session | null) => {
      if (!session) {
        setState((current) => (current.status === "signed-out" ? current : { status: "signed-out" }));
        return;
      }
      const staff = await loadStaff(session);
      if (staff) setState({ status: "ready", staff });
      else await signOut(NOT_STAFF_NOTICE);
    },
    [signOut],
  );

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    await resolve(data.session);
  }, [resolve]);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) void resolve(data.session);
    });
    // Sign-in, sign-out and profile changes from any tab. Work is deferred out
    // of the callback: supabase-js holds a lock while it runs, and a query
    // made inside it would wait on that same lock.
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        setTimeout(() => {
          if (active) void resolve(session);
        }, 0);
      }
    });
    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [resolve]);

  const value = useMemo(() => ({ state, signOut, refresh }), [state, signOut, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
