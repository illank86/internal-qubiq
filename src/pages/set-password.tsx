import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Alert, Button, Form, Input, Spin, Typography } from "antd";
import type { EmailOtpType } from "@supabase/supabase-js";
import { useAuth } from "@/auth/use-auth";
import { AuthCard } from "@/components/ui";
import { supabase } from "@/lib/supabase";

const LINK_TYPES: EmailOtpType[] = ["invite", "recovery"];

type Values = { password: string; confirm: string };

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
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A link works once: never verify it twice (React runs effects twice in development).
  const verified = useRef<string | null>(null);

  useEffect(() => {
    if (!validLink || !tokenHash || !type || verified.current === tokenHash) return;
    verified.current = tokenHash;
    supabase.auth.verifyOtp({ token_hash: tokenHash, type }).then(({ error: verifyError }) => {
      if (verifyError) setLinkError("This link has expired or was already used. Ask for a new one.");
      // Drop the one-time token from the address bar and history.
      window.history.replaceState(null, "", "/set-password");
      setVerifying(false);
    });
  }, [validLink, tokenHash, type]);

  const submit = async ({ password }: Values) => {
    setPending(true);
    setError(null);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setPending(false);
    if (updateError) return setError(updateError.message);
    navigate("/", { replace: true });
  };

  return (
    <AuthCard
      title={invite ? "Welcome to QUBIQ" : "Choose a new password"}
      intro={invite ? "Set a password to finish setting up your team account." : "Pick something you do not use anywhere else."}
    >
      {verifying || state.status === "loading" ? (
        <div style={{ textAlign: "center", padding: 16 }}>
          <Spin />
          <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
            Checking your link…
          </Typography.Paragraph>
        </div>
      ) : linkError || state.status !== "ready" ? (
        <>
          <Alert
            type="error"
            showIcon
            title={linkError ?? (state.status === "signed-out" && state.notice ? state.notice : "Open the link from your email to set a password.")}
          />
          <div style={{ marginTop: 16, textAlign: "center" }}>
            <Link to="/forgot-password">Send a new reset link</Link>
          </div>
        </>
      ) : (
        <Form<Values> layout="vertical" requiredMark={false} onFinish={submit} disabled={pending}>
          <Typography.Paragraph type="secondary">
            Signed in as <Typography.Text strong>{state.staff.email}</Typography.Text>
          </Typography.Paragraph>
          {error ? <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} /> : null}
          <Form.Item
            label="New password"
            name="password"
            extra="At least 10 characters."
            rules={[{ required: true, min: 10, message: "Use at least 10 characters" }]}
          >
            <Input.Password autoComplete="new-password" size="large" />
          </Form.Item>
          <Form.Item
            label="Repeat it"
            name="confirm"
            dependencies={["password"]}
            rules={[
              { required: true, message: "Repeat the password" },
              ({ getFieldValue }) => ({
                validator: (_, value) =>
                  !value || getFieldValue("password") === value ? Promise.resolve() : Promise.reject(new Error("The two passwords do not match")),
              }),
            ]}
          >
            <Input.Password autoComplete="new-password" size="large" />
          </Form.Item>
          <Button type="primary" htmlType="submit" size="large" block loading={pending}>
            {invite ? "Set password and continue" : "Save password"}
          </Button>
        </Form>
      )}
    </AuthCard>
  );
}
