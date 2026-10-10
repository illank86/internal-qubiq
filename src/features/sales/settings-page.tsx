import { RichTextField } from "@/features/content/rich-text-field";
import { useNavigate, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Card, Col, Divider, Flex, Form, Input, InputNumber, Result, Row, Skeleton, Switch, Tabs, Typography } from "antd";
import { PageTitle } from "@/components/app-shell";
import { useCan } from "@/auth/use-auth";
import type { Database } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";
import { SaveBar, useSettingsSave } from "./settings-save";
import { SignatureCard } from "./signature-card";
import { TierDiscounts } from "./tier-discounts";

type Settings = Database["public"]["Tables"]["invoice_settings"]["Row"];

/**
 * Sales settings, one owner per tab — nothing here is shared with Finance:
 *   Quotations       sales (quotations.manage)
 *   Delivery orders  licensing (licenses.manage)
 *   Approvals        user managers (users.manage)
 * Company details, invoices, ways to pay and tax are Finance's (Finance → Settings).
 * The database checks the same split, column by column.
 */
export function SalesSettingsPage() {
  const can = useCan();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tabs = [can("quotations.manage") && "quotations", can("licenses.manage") && "delivery", can("users.manage") && "approvals"].filter(Boolean) as string[];
  const tab = tabs.includes(params.get("tab") ?? "") ? (params.get("tab") as string) : tabs[0];

  const { data, isLoading } = useQuery({
    queryKey: ["sales-settings"],
    queryFn: async () => {
      const { data: row, error } = await supabase.from("invoice_settings").select("*").eq("id", true).maybeSingle();
      if (error) throw error;
      return row;
    },
  });
  if (isLoading) return <Skeleton active paragraph={{ rows: 10 }} />;
  if (!data) return <Result status="warning" title="Sales settings could not be loaded." />;

  return (
    <>
      <PageTitle title="Sales settings" description="Quotations, delivery orders and approvals. Company details, invoices, ways to pay and tax are set in Finance." />
      {can("accounting.manage") ? (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          title="Company details, invoices, ways to pay and tax are in Finance settings."
          action={
            <Button size="small" onClick={() => navigate("/finance/settings?tab=invoices")}>
              Open Finance settings
            </Button>
          }
        />
      ) : null}
      <Card>
        <Tabs
          activeKey={tab}
          onChange={(key) => setParams({ tab: key }, { replace: true })}
          items={[
            { key: "quotations", label: "Quotations", children: <QuotationSettings settings={data} /> },
            { key: "delivery", label: "Delivery orders", children: <DeliverySettings settings={data} /> },
            { key: "approvals", label: "Approvals", children: <ApprovalSettings settings={data} /> },
          ].filter((item) => tabs.includes(item.key))}
        />
      </Card>
    </>
  );
}

type QuoteValues = Pick<Settings, "quote_number_prefix" | "quote_validity_days" | "quote_closing" | "quote_signoff" | "quote_terms">;

function QuotationSettings({ settings }: { settings: Settings }) {
  const [form] = Form.useForm<QuoteValues>();
  const { save, pending, error } = useSettingsSave();
  return (
    <>
      <Form<QuoteValues>
        form={form}
        layout="vertical"
        requiredMark="optional"
        disabled={pending}
        initialValues={settings}
        onFinish={(values) => save(values, "Saved. New quotations use these.")}
      >
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item label="Quotation number prefix" name="quote_number_prefix" extra="Numbers look like QUO-2026-0001." rules={[{ required: true }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item label="Quotations valid for" name="quote_validity_days" extra="Sets the Valid until date of a new quotation." rules={[{ required: true }]}>
              <InputNumber min={1} max={365} suffix="days" style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item label="Default closing paragraph" name="quote_closing" extra="{company}, {name}, {email} and {phone} are filled in. Leave empty for none.">
              <Input.TextArea rows={4} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item label="Default sign-off" name="quote_signoff" extra="e.g. Best regards," rules={[{ required: true }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item label="Default terms & conditions" name="quote_terms" extra="Printed on every new quotation, and editable on each one.">
              <RichTextField rows={10} />
            </Form.Item>
          </Col>
        </Row>
        <SaveBar pending={pending} error={error} onSave={() => form.submit()} />
      </Form>
      <Divider titlePlacement="start">Integrator tier discounts</Divider>
      <Typography.Paragraph type="secondary" style={{ marginTop: -8 }}>
        The partner discount a quotation gets when it comes through an integrator, by their tier. Tiers are added under Integrators → Integrator tiers.
      </Typography.Paragraph>
      <TierDiscounts />
    </>
  );
}

function DeliverySettings({ settings }: { settings: Settings }) {
  const [form] = Form.useForm<{ do_number_prefix: string }>();
  const { save, pending, error } = useSettingsSave();
  return (
    <Form form={form} layout="vertical" requiredMark="optional" disabled={pending} initialValues={settings} onFinish={(values) => save(values, "Saved.")}>
      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item label="Delivery order number prefix" name="do_number_prefix" extra="Numbers look like DO-2026-0001." rules={[{ required: true }]}>
            <Input />
          </Form.Item>
        </Col>
      </Row>
      <SaveBar pending={pending} error={error} onSave={() => form.submit()} />
    </Form>
  );
}

function ApprovalSettings({ settings }: { settings: Settings }) {
  const { save, pending, error } = useSettingsSave();
  return (
    <Flex vertical gap={20}>
      <Flex justify="space-between" align="center" gap={16}>
        <div>
          <Typography.Text strong>Require a second approver (four-eyes)</Typography.Text>
          <Typography.Paragraph type="secondary" style={{ margin: "2px 0 0", maxWidth: 720 }}>
            When on, an approver's own quotations and invoices go to the other approvers, and nobody can approve what they asked for. If someone is the
            only approver for that kind of document, they can still approve their own, so nothing gets stuck. Off: an approver's own send is approved at
            once.
          </Typography.Paragraph>
        </div>
        <Switch
          checked={settings.require_second_approver}
          loading={pending}
          onChange={(checked) => save({ require_second_approver: checked }, checked ? "Four-eyes is on." : "Four-eyes is off.")}
        />
      </Flex>
      {error ? <Alert type="error" showIcon title={error} /> : null}
      <SignatureCard />
    </Flex>
  );
}
