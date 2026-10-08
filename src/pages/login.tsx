import { useState } from "react";
import { Link, Navigate, useLocation } from "react-router";
import { LogIn } from "lucide-react";
import { useAuth } from "@/auth/use-auth";
import { AuthCard, Button, Field, Input, Notice } from "@/components/ui";
import { supabase } from "@/lib/supabase";

/**
 * Staff sign-in. There is no "create account" here: staff are invited from
 * Users & roles, and customers register on the website.
 */
export function LoginPage() {
  const { state } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const from = (location.state as { from?: string } | null)?.from ?? "/";
  if (state.status === "ready") return <Navigate to={from} replace />;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setPending(false);
    if (signInError) {
      setError(
        signInError.message.toLowerCase().includes("email not confirmed")
          ? "Confirm your email first — open the link in your invitation."
          : "That email and password do not match.",
      );
    }
    // On success the auth provider checks this is a staff account.
  };

  const notice = state.status === "signed-out" ? state.notice : undefined;

  return (
    <AuthCard title="Sign in" intro="The QUBIQ team's internal app: sales, licensing, content and more.">
      <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
        {notice ? <Notice>{notice}</Notice> : null}
        {error ? <Notice tone="error">{error}</Notice> : null}
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
        <Button type="submit" pending={pending} disabled={!email || !password}>
          <LogIn aria-hidden />
          Sign in
        </Button>
        <Link to="/forgot-password" className="text-center text-sm text-muted-foreground hover:text-foreground">
          Forgot your password?
        </Link>
      </form>
    </AuthCard>
  );
}
