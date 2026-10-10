import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Card, Col, Flex, Form, InputNumber, Row, Typography } from "antd";
import { ClockCircleOutlined, SaveOutlined } from "@ant-design/icons";
import { supabase } from "@/lib/supabase";
import { errorText } from "@/lib/sales";

type Values = { idle_minutes: number; max_session_hours: number };

/** How long a sign-in to QUBIQ Admin lasts, for everyone on the team. */
export function SessionSettingsCard() {
  const [form] = Form.useForm<Values>();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);
  const { data } = useQuery({
    queryKey: ["session-settings"],
    queryFn: async () => (await supabase.from("staff_session_settings").select("idle_minutes, max_session_hours").maybeSingle()).data,
  });

  const save = async (values: Values) => {
    setSaving(true);
    const { error } = await supabase.from("staff_session_settings").update({ ...values, updated_at: new Date().toISOString() }).eq("id", true);
    setSaving(false);
    if (error) return message.error(errorText(error, "The settings could not be saved."));
    await queryClient.invalidateQueries({ queryKey: ["session-settings"] });
    message.success("Saved. It applies on every computer within a few minutes.");
  };

  if (!data) return null;
  return (
    <Card
      style={{ marginTop: 16 }}
      title={
        <Flex align="center" gap={8}>
          <ClockCircleOutlined />
          Sign-in security
        </Flex>
      }
    >
      <Typography.Paragraph type="secondary">
        A forgotten sign-in on another computer ends by itself: after a stretch without activity (with a minute's warning), and in any case after the
        maximum time. To end someone's sign-ins at once, use “Sign out everywhere” on their row above.
      </Typography.Paragraph>
      <Form<Values> form={form} layout="vertical" initialValues={data} onFinish={save} disabled={saving}>
        <Row gutter={16}>
          <Col xs={24} sm={12} md={8}>
            <Form.Item label="Sign out after inactivity" name="idle_minutes" rules={[{ required: true }]} extra="5 to 720 minutes. 30 is a common choice.">
              <InputNumber min={5} max={720} suffix="minutes" style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Form.Item label="Sign in again after" name="max_session_hours" rules={[{ required: true }]} extra="1 to 168 hours, even when active.">
              <InputNumber min={1} max={168} suffix="hours" style={{ width: "100%" }} />
            </Form.Item>
          </Col>
        </Row>
        <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>
          Save
        </Button>
      </Form>
    </Card>
  );
}
