import { useState } from "react";
import { Alert, App, Avatar, Button, Card, Col, Flex, Form, Input, Row, Typography } from "antd";
import { LockOutlined, SaveOutlined } from "@ant-design/icons";
import { useAuth, useStaff } from "@/auth/use-auth";
import { NEW_PASSWORD_RULES, PASSWORD_HINT } from "@/auth/password-rules";
import { PageTitle } from "@/components/app-shell";
import { supabase } from "@/lib/supabase";

type ProfileValues = { full_name: string; job_title: string; phone: string; company: string };
type PasswordValues = { current: string; password: string; confirm: string };

/**
 * Your own account: the name and position on quotations you prepare, your
 * phone, and your password. The same account as on goqubiq.com.
 */
export function ProfilePage() {
  const staff = useStaff();
  const { refresh } = useAuth();
  const { message } = App.useApp();
  const [profileForm] = Form.useForm<ProfileValues>();
  const [passwordForm] = Form.useForm<PasswordValues>();
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const name = staff.profile?.full_name || staff.email;

  const saveProfile = async (values: ProfileValues) => {
    setSavingProfile(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: values.full_name.trim(),
        job_title: values.job_title?.trim() || null,
        phone: values.phone?.trim() || null,
        company: values.company?.trim() || null,
      })
      .eq("id", staff.id);
    setSavingProfile(false);
    if (error) return void message.error("Your profile could not be saved.");
    await refresh();
    message.success("Profile saved.");
  };

  /**
   * Supabase checks the current password ("Require current password when
   * updating"); a session older than a day must sign in again first. Other
   * devices are signed out afterwards.
   */
  const changePassword = async (values: PasswordValues) => {
    setSavingPassword(true);
    setPasswordError(null);
    const { error } = await supabase.auth.updateUser({ password: values.password, current_password: values.current });
    if (error) {
      setSavingPassword(false);
      switch (error.code) {
        case "current_password_mismatch":
        case "current_password_required":
        case "invalid_credentials":
          passwordForm.setFields([{ name: "current", errors: ["Not your current password"] }]);
          return;
        case "reauthentication_needed":
          return setPasswordError("For your security, sign out and sign back in, then change your password.");
        case "same_password":
          passwordForm.setFields([{ name: "password", errors: ["That is already your password"] }]);
          return;
        case "weak_password":
          passwordForm.setFields([{ name: "password", errors: ["That password is too easy to guess"] }]);
          return;
        default:
          return setPasswordError("Your password could not be changed. Please try again.");
      }
    }
    await supabase.auth.signOut({ scope: "others" });
    setSavingPassword(false);
    passwordForm.resetFields();
    message.success("Password changed. Other devices have been signed out.");
  };

  return (
    <>
      <PageTitle title="My profile" description="Your account — the same one you use on goqubiq.com." />
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card title="Profile">
            <Flex align="center" gap={16} style={{ marginBottom: 24 }}>
              <Avatar size={64} src={staff.profile?.avatar_url ?? undefined} style={{ fontSize: 24 }}>
                {name[0]?.toUpperCase()}
              </Avatar>
              <div>
                <Typography.Text strong style={{ fontSize: 16 }}>
                  {name}
                </Typography.Text>
                <br />
                <Typography.Text type="secondary">{staff.email}</Typography.Text>
              </div>
            </Flex>
            <Form<ProfileValues>
              form={profileForm}
              layout="vertical"
              requiredMark="optional"
              disabled={savingProfile}
              onFinish={saveProfile}
              initialValues={{
                full_name: staff.profile?.full_name ?? "",
                job_title: staff.profile?.job_title ?? "",
                phone: staff.profile?.phone ?? "",
                company: staff.profile?.company ?? "",
              }}
            >
              <Row gutter={16}>
                <Col xs={24} sm={12}>
                  <Form.Item label="Name" name="full_name" rules={[{ required: true, whitespace: true, message: "Enter your name" }, { max: 120 }]}>
                    <Input />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item label="Position" name="job_title" extra="Printed under your name on quotations." rules={[{ max: 120 }]}>
                    <Input placeholder="Sales Engineer" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item label="Phone" name="phone" extra="Customers see it on quotations you prepare." rules={[{ max: 40 }]}>
                    <Input />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item label="Company" name="company" rules={[{ max: 160 }]}>
                    <Input />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item label="Email" extra="To change your email, ask an admin to invite the new address.">
                <Input value={staff.email} disabled />
              </Form.Item>
              <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={savingProfile}>
                Save profile
              </Button>
            </Form>
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="Password">
            {passwordError ? <Alert type="warning" showIcon title={passwordError} style={{ marginBottom: 16 }} /> : null}
            <Form<PasswordValues> form={passwordForm} layout="vertical" disabled={savingPassword} onFinish={changePassword}>
              <Form.Item label="Current password" name="current" rules={[{ required: true, message: "Enter your current password" }]}>
                <Input.Password autoComplete="current-password" prefix={<LockOutlined style={{ marginInlineEnd: 8, opacity: 0.6 }} />} />
              </Form.Item>
              <Form.Item label="New password" name="password" extra={PASSWORD_HINT} rules={NEW_PASSWORD_RULES}>
                <Input.Password autoComplete="new-password" />
              </Form.Item>
              <Form.Item
                label="Repeat the new password"
                name="confirm"
                dependencies={["password"]}
                rules={[
                  { required: true, message: "Repeat the new password" },
                  ({ getFieldValue }) => ({
                    validator: (_, value) => (!value || getFieldValue("password") === value ? Promise.resolve() : Promise.reject(new Error("The two passwords do not match"))),
                  }),
                ]}
              >
                <Input.Password autoComplete="new-password" />
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={savingPassword}>
                Change password
              </Button>
            </Form>
          </Card>
        </Col>
      </Row>
    </>
  );
}
