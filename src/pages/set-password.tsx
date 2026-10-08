import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import type { EmailOtpType } from "@supabase/supabase-js";
import { useAuth } from "@/auth/use-auth";
import { AuthCard, Button, Field, Input, Notice } from "@/components/ui";
import { supabase } from "@/lib/supabase";

const LINK_TYPES: EmailOtpType[] = ["invite", "recovery"];

/**
 * Where the invitation and reset-password emails land:
 * /set-password?token_hash=…&type=invite|recovery
 *
 * The link is verified once (it signs the person in), then they choose a
 * password. A staff member's first visit is through an invitation — there is
 * no sign-up in this app.
 */
export function SetPasswordPage() {
  const { state } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const invite = type === "invite";

  const validLink = Boolean(tokenHash && type && LINK_TYPES.includes(type));
  const [verifying, setVerifying] = useState(validLink);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!validLink || !tokenHash || !type) return;
    let active = true;
    supabase.auth.verifyOtp({ token_hash: tokenHash, type }).then(({ error: verifyError }) => {
      if (!active) return;
      if (verifyError) setLinkError("This link has expired or was already used. Ask for a new one.");
      // Drop the one-time token from the address bar and history.
      window.history.replaceState(null, "", "/set-password");
      setVerifying(false);
    });
    return () => {
      active = false;
    };
  }, [validLink, tokenHash, type]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 10) return setError("Use at least 10 characters.");
    if (password !== confirm) return setError("The two passwords do not match.");
    setPending(true);
    setError(null);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setPending(false);
    if (updateError) return setError(updateError.message);
    navigate("/", { replace: true });
  };

  const signedIn = state.status === "ready";

  return (
    <AuthCard
      title={invite ? "Welcome to QUBIQ" : "Choose a new password"}
      intro={invite ? "Set a password to finish setting up your team account." : "Pick something you do not use anywhere else."}
    >
      {verifying || state.status === "loading" ? (
        <p className="text-sm text-muted-foreground">Checking your link…</p>
      ) : linkError || !signedIn ? (
        <div className="flex flex-col gap-5">
          <Notice tone="error">
            {linkError ?? (state.status === "signed-out" && state.notice ? state.notice : "Open the link from your email to set a password.")}
          </Notice>
          <Link to="/forgot-password" className="text-center text-sm text-muted-foreground hover:text-foreground">
            Send a new reset link
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-5">
          <p className="text-sm text-muted-foreground">
            Signed in as <span className="font-medium text-foreground">{state.staff.email}</span>
          </p>
          {error ? <Notice tone="error">{error}</Notice> : null}
          <Field label="New password" htmlFor="password" hint="At least 10 characters.">
            <Input id="password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </Field>
          <Field label="Repeat it" htmlFor="confirm">
            <Input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} />
          </Field>
          <Button type="submit" pending={pending} disabled={!password || !confirm}>
            {invite ? "Set password and continue" : "Save password"}
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
