import { createContext, useContext } from "react";
import type { AppPermission, AppRole, Profile } from "@/lib/types";

export type Staff = {
  id: string;
  email: string;
  profile: Profile | null;
  roles: AppRole[];
  permissions: AppPermission[];
};

export type AuthState =
  | { status: "loading" }
  | { status: "signed-out"; notice?: string }
  | { status: "ready"; staff: Staff };

export type AuthContextValue = {
  state: AuthState;
  signOut: (notice?: string) => Promise<void>;
  refresh: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export const NOT_STAFF_NOTICE = "QUBIQ Admin is for the QUBIQ team. Customers sign in on goqubiq.com.";

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthProvider>");
  return value;
}

/** The signed-in staff member; only for pages behind <RequireStaff>. */
export function useStaff() {
  const { state } = useAuth();
  if (state.status !== "ready") throw new Error("useStaff used outside a signed-in page");
  return state.staff;
}

export function useCan() {
  const staff = useStaff();
  return (permission: AppPermission) => staff.permissions.includes(permission);
}
