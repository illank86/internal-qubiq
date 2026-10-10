import { useState } from "react";
import { Link, Navigate, useLocation } from "react-router";
import { Alert, Button, Checkbox, Form, Input, Tooltip } from "antd";
import { LockOutlined, LoginOutlined, MailOutlined } from "@ant-design/icons";
import { useAuth } from "@/auth/use-auth";
import { Captcha } from "@/components/captcha";
import { CAPTCHA_REQUIRED } from "@/components/captcha-config";
import { AuthCard } from "@/components/ui";
import { setRememberDevice, supabase } from "@/lib/supabase";
import { markSignedIn } from "@/auth/session-guard";

type Values = { email: string; password: string; remember: boolean };

/**
 * Staff sign-in. There is no "create account" here: staff are invited from
 * Users & roles, and customers register on the website.
 */
export function LoginPage() {
  const { state } = useAuth();
  const location = useLocation();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState("");
  // A captcha token works once: a new one after every attempt.
  const [attempt, setAttempt] = useState(0);

  const from = (location.state as { from?: string } | null)?.from ?? "/";
  if (state.status === "ready") return <Navigate to={from} replace />;

  const submit = async ({ email, password, remember }: Values) => {
    setPending(true);
    setError(null);
    // Before signing in: decides where the sign-in is kept.
    setRememberDevice(remember);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
      options: captchaToken ? { captchaToken } : undefined,
    });
    setPending(false);
    setAttempt((count) => count + 1);
    if (signInError) {
      setError(
        signInError.message.toLowerCase().includes("email not confirmed")
          ? "Confirm your email first — open the link in your invitation."
          : signInError.message.toLowerCase().includes("captcha")
            ? "The security check did not pass. Wait for it to finish, then try again."
            : "That email and password do not match.",
      );
    } else {
      markSignedIn();
    }
    // On success the auth provider checks this is a staff account.
  };

  const notice = state.status === "signed-out" ? state.notice : undefined;

  return (
    <AuthCard intro="Sales, licensing and content for the QUBIQ team">
      <Form<Values> layout="vertical" requiredMark={false} onFinish={submit} disabled={pending} initialValues={{ remember: false }}>
        {notice ? <Alert type="info" showIcon title={notice} style={{ marginBottom: 16 }} /> : null}
        {error ? <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} /> : null}
        <Form.Item label="Email" name="email" rules={[{ required: true, type: "email", message: "Enter your work email" }]}>
          <Input prefix={<MailOutlined style={{ marginInlineEnd: 8, opacity: 0.6 }} />} autoComplete="username" size="large" />
        </Form.Item>
        <Form.Item label="Password" name="password" rules={[{ required: true, message: "Enter your password" }]}>
          <Input.Password prefix={<LockOutlined style={{ marginInlineEnd: 8, opacity: 0.6 }} />} autoComplete="current-password" size="large" />
        </Form.Item>
        <Form.Item name="remember" valuePropName="checked" style={{ marginTop: -8, marginBottom: 16 }}>
          <Checkbox>
            <Tooltip title="Untick on a shared or office computer: you are signed out when the browser closes.">Keep me signed in on this device</Tooltip>
          </Checkbox>
        </Form.Item>
        <Captcha onToken={setCaptchaToken} resetKey={attempt} />
        {/* Without a token Supabase refuses the sign-in, so wait for the check. */}
        <Button type="primary" htmlType="submit" size="large" block loading={pending} disabled={CAPTCHA_REQUIRED && !captchaToken} icon={<LoginOutlined />}>
          {CAPTCHA_REQUIRED && !captchaToken ? "Checking…" : "Sign in"}
        </Button>
        <div style={{ marginTop: 16, textAlign: "center" }}>
          <Link to="/forgot-password">Forgot your password?</Link>
        </div>
      </Form>
    </AuthCard>
  );
}
