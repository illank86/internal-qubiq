import { useState } from "react";
import { Link } from "react-router";
import { AuthCard, Button, Field, Input, Notice } from "@/components/ui";
import { supabase } from "@/lib/supabase";

/**
 * Sends a password-reset email. The answer is the same whether or not the
 * address has an account, so this page tells nobody who works here.
 */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/set-password` });
    setPending(false);
    setSent(true);
  };

  return (
    <AuthCard title="Reset your password" intro="We will email you a link to choose a new one.">
      {sent ? (
        <div className="flex flex-col gap-5">
          <Notice tone="success">If that address has an account, a reset link is on its way. It works once, for an hour.</Notice>
          <Link to="/login" className="text-center text-sm text-muted-foreground hover:text-foreground">
            Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-5">
          <Field label="Email" htmlFor="email">
            <Input id="email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </Field>
          <Button type="submit" pending={pending} disabled={!email}>
            Send reset link
          </Button>
          <Link to="/login" className="text-center text-sm text-muted-foreground hover:text-foreground">
            Back to sign in
          </Link>
        </form>
      )}
    </AuthCard>
  );
}
