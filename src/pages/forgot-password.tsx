import { useState } from "react";
import { Link } from "react-router";
import { Alert, Button, Form, Input } from "antd";
import { MailOutlined } from "@ant-design/icons";
import { Captcha } from "@/components/captcha";
import { AuthCard } from "@/components/ui";
import { supabase } from "@/lib/supabase";

/**
 * Sends a password-reset email. The answer is the same whether or not the
 * address has an account, so this page tells nobody who works here.
 */
export function ForgotPasswordPage() {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");

  const submit = async ({ email }: { email: string }) => {
    setPending(true);
    await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/set-password`,
      captchaToken: captchaToken || undefined,
    });
    setPending(false);
    setSent(true);
  };

  return (
    <AuthCard title="Reset your password" intro="We will email you a link to choose a new one.">
      {sent ? (
        <>
          <Alert type="success" showIcon title="If that address has an account, a reset link is on its way. It works once, for an hour." />
          <div style={{ marginTop: 16, textAlign: "center" }}>
            <Link to="/login">Back to sign in</Link>
          </div>
        </>
      ) : (
        <Form<{ email: string }> layout="vertical" requiredMark={false} onFinish={submit} disabled={pending}>
          <Form.Item label="Email" name="email" rules={[{ required: true, type: "email", message: "Enter your work email" }]}>
            <Input prefix={<MailOutlined />} autoComplete="username" size="large" />
          </Form.Item>
          <Captcha onToken={setCaptchaToken} />
          <Button type="primary" htmlType="submit" size="large" block loading={pending}>
            Send reset link
          </Button>
          <div style={{ marginTop: 16, textAlign: "center" }}>
            <Link to="/login">Back to sign in</Link>
          </div>
        </Form>
      )}
    </AuthCard>
  );
}
