import { useState } from "react";
import { RichTextField } from "@/features/content/rich-text-field";
import { useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, App, AutoComplete, Button, Card, Col, Divider, Flex, Form, Input, InputNumber, Result, Row, Select, Skeleton, Space, Switch, Tabs, Typography } from "antd";
import { SaveOutlined } from "@ant-design/icons";
import { PageTitle } from "@/components/app-shell";
import { useCan } from "@/auth/use-auth";
import type { Database } from "@/lib/database.types";
import { errorText } from "@/lib/sales";
import { supabase } from "@/lib/supabase";
import { PaymentMethodsField } from "./payment-methods-field";
import { SignatureCard } from "./signature-card";
import { TierDiscounts } from "./tier-discounts";

type Settings = Database["public"]["Tables"]["invoice_settings"]["Row"];
type Values = Omit<Settings, "id" | "updated_at">;

const TAB_KEYS = ["general", "invoices", "quotations", "delivery"] as const;

/**
 * Defaults for invoices and quotations. General holds what both documents
 * print or compute the same way; each document's tab holds only its own.
 * Our company name, address, email and phone, as printed on both, are set
 * here; Site settings' address is the website's and the customer emails'.
 */
export function SalesSettingsPage() {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [form] = Form.useForm<Values>();
  const can = useCan();
  // The four-eyes rule is a control over approvers: user managers set it.
  const canSetFourEyes = can("users.manage");
  // Sales (without licensing) edits the quotation wording only.
  const licensing = can("licenses.manage");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tab = !licensing
    ? "quotations"
    : TAB_KEYS.includes(params.get("tab") as (typeof TAB_KEYS)[number])
      ? (params.get("tab") as string)
      : "general";

  const { data, isLoading } = useQuery({
    queryKey: ["sales-settings"],
    queryFn: async () => {
      const { data: row, error: loadError } = await supabase.from("invoice_settings").select("*").eq("id", true).maybeSingle();
      if (loadError) throw loadError;
      return row;
    },
  });

  if (isLoading) return <Skeleton active paragraph={{ rows: 10 }} />;
  if (!data) return <Result status="warning" title="Sales settings could not be loaded." />;

  const save = async (values: Values) => {
    setPending(true);
    setError(null);
    const changes: Partial<Values> = licensing
      ? values
      : {
          quote_number_prefix: values.quote_number_prefix,
          quote_validity_days: values.quote_validity_days,
          quote_terms: values.quote_terms,
          quote_closing: values.quote_closing,
          quote_signoff: values.quote_signoff,
        };
    const { error: saveError } = await supabase.from("invoice_settings").update(changes).eq("id", true);
    setPending(false);
    if (saveError) return setError(errorText(saveError, "The settings could not be saved."));
    await Promise.all(["sales-settings", "sales-catalog", "sends-directly", "sales-money"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
    message.success(licensing ? "Saved. New invoices and quotations use these." : "Saved. New quotations use these.");
  };

  const { id: _id, updated_at: _updated, ...initialValues } = data;

  return (
    <>
      <PageTitle
        title="Sales settings"
        description={
          licensing
            ? "Defaults for invoices and quotations, and our company details as they print on them."
            : "Defaults for new quotations. Tax, payment and company details are set by licensing."
        }
        actions={
          <Button type="primary" icon={<SaveOutlined />} loading={pending} onClick={() => form.submit()}>
            Save settings
          </Button>
        }
      />
      {error ? <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} /> : null}
      <Form<Values> form={form} layout="vertical" initialValues={initialValues} onFinish={save} disabled={pending} requiredMark="optional">
        <Card>
          <Tabs
            activeKey={tab}
            onChange={(key) => setParams({ tab: key }, { replace: true })}
            // Every tab stays mounted, so the form submits all fields whichever tab is open.
            destroyOnHidden={false}
            items={[
              {
                key: "general",
                label: "General",
                forceRender: true,
                children: (
                  <Row gutter={16}>
                    <Col span={24}>
                      <Divider titlePlacement="start" style={{ marginTop: 0 }}>
                        Our company, as printed on quotations and invoices
                      </Divider>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item label="Company name" name="company_name" rules={[{ required: true, whitespace: true, message: "Enter the company name" }, { max: 200 }]}>
                        <Input placeholder="QUBIQ Inovasi Digital" />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item label="Email" name="company_email" rules={[{ type: "email", message: "Enter a valid email" }]} extra="Printed under our address, e.g. sales@goqubiq.com.">
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item label="Address" name="company_address" rules={[{ max: 500 }]} extra="One line per row, as it should print.">
                        <Input.TextArea autoSize={{ minRows: 4, maxRows: 8 }} placeholder={"Street and number\nArea\nCity, province\nCountry"} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item label="Phone" name="company_phone" rules={[{ max: 60 }]}>
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col span={24}>
                      <Divider titlePlacement="start">Approvals</Divider>
                    </Col>
                    <Col span={24}>
                      <Flex justify="space-between" align="center" gap={16} style={{ marginBottom: 24 }}>
                        <div>
                          <Typography.Text strong>Require a second approver (four-eyes)</Typography.Text>
                          {canSetFourEyes ? null : (
                            <Typography.Text type="secondary" style={{ fontSize: 12, display: "block" }}>
                              Only someone who manages users can change this.
                            </Typography.Text>
                          )}
                          <Typography.Paragraph type="secondary" style={{ margin: "2px 0 0", maxWidth: 720 }}>
                            When on, an approver's own quotations and invoices go to the other approvers, and nobody can approve what they asked for. If
                            someone is the only approver for that kind of document, they can still approve their own, so nothing gets stuck. Off: an
                            approver's own send is approved at once.
                          </Typography.Paragraph>
                        </div>
                        <Form.Item name="require_second_approver" valuePropName="checked" noStyle>
                          <Switch disabled={!canSetFourEyes} />
                        </Form.Item>
                      </Flex>
                    </Col>
                    <Col span={24}>
                      <Divider titlePlacement="start">Reporting</Divider>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item
                        label="Reporting currency"
                        name="reporting_currency"
                        extra="The dashboard adds everything up in this currency (anyone can switch to IDR or USD there). Quotations and invoices keep their own currency."
                        rules={[{ required: true }]}
                      >
                        <Select
                          options={[
                            { value: "IDR", label: "IDR — Indonesian rupiah" },
                            { value: "USD", label: "USD — US dollar" },
                          ]}
                        />
                      </Form.Item>
                    </Col>
                    <Col span={24}>
                      <Divider titlePlacement="start">Tax and documents</Divider>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item label="Tax name" name="tax_label" extra="As printed, e.g. PPN or VAT." rules={[{ required: true }]}>
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item label="Tax rate" name="tax_rate" extra="Applied to every new invoice and quotation; can be changed on each." rules={[{ required: true }]}>
                        <InputNumber min={0} max={100} suffix="%" style={{ width: "100%" }} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item
                        label="Company name in Indonesia"
                        name="local_company_name"
                        extra='Printed on documents in IDR. Empty: "PT. " and the company name from Site settings.'
                        rules={[{ max: 160 }]}
                      >
                        <Input placeholder="PT. QUBIQ Teknologi Indonesia" />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item label="Our tax number" extra="Printed under our address on invoices and quotations, e.g. NPWP 01.234.567.8-901.000.">
                        <Space.Compact block>
                          <Form.Item name="tax_id_label" noStyle rules={[{ required: true, whitespace: true }, { max: 40 }]}>
                            {/* What it is called in your country; pick one or type your own. */}
                            <AutoComplete
                              style={{ width: 150 }}
                              options={["NPWP", "Tax ID", "VAT No.", "GST No.", "TIN", "EIN", "ABN", "UEN", "SST No.", "TRN"].map((value) => ({ value }))}
                              filterOption={false}
                              placeholder="Tax ID"
                              aria-label="Name of the tax number"
                            />
                          </Form.Item>
                          <Form.Item name="tax_id" noStyle>
                            <Input placeholder="e.g. 01.234.567.8-901.000" aria-label="Tax number" />
                          </Form.Item>
                        </Space.Compact>
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item label="Decimal places" name="decimal_places" extra="0 for whole rupiah, 2 for cents. Can be changed on each document." rules={[{ required: true }]}>
                        <InputNumber min={0} max={4} style={{ width: "100%" }} />
                      </Form.Item>
                    </Col>
                    <Col span={24}>
                      <Form.Item label="Footer note" name="footer_note" extra="One line at the bottom of every invoice and quotation page.">
                        <Input />
                      </Form.Item>
                    </Col>
                  </Row>
                ),
              },
              {
                key: "invoices",
                label: "Invoices",
                forceRender: true,
                children: (
                  <Row gutter={16}>
                    <Col xs={24} md={12}>
                      <Form.Item label="Invoice number prefix" name="number_prefix" extra="Numbers look like INV-2026-0001." rules={[{ required: true }]}>
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item label="Payment due after" name="payment_terms_days" extra="Sets the due date of a new invoice." rules={[{ required: true }]}>
                        <InputNumber min={0} max={365} suffix="days" style={{ width: "100%" }} />
                      </Form.Item>
                    </Col>
                    <Col span={24}>
                      <Form.Item
                        label="Ways to pay"
                        name="payment_methods"
                        extra="Printed on the How to pay page of every unpaid invoice — its own page, a card per way to pay. Give a way to pay a currency to show it only on invoices in that currency."
                      >
                        <PaymentMethodsField />
                      </Form.Item>
                    </Col>
                    <Col span={24}>
                      <Form.Item
                        label="Payment note"
                        name="bank_details"
                        extra="Optional. Printed above the ways to pay — e.g. who pays bank charges. With no ways to pay set up, this is printed instead."
                      >
                        <RichTextField rows={4} />
                      </Form.Item>
                    </Col>
                  </Row>
                ),
              },
              {
                key: "quotations",
                label: "Quotations",
                forceRender: true,
                children: (
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
                    <Col span={24}>
                      <Divider titlePlacement="start">Integrator tier discounts</Divider>
                      <Typography.Paragraph type="secondary" style={{ marginTop: -8 }}>
                        The partner discount a quotation gets when it comes through an integrator, by their tier. Tiers are added under
                        Integrators → Integrator tiers.
                      </Typography.Paragraph>
                      <TierDiscounts />
                    </Col>
                  </Row>
                ),
              },
              {
                key: "delivery",
                label: "Delivery orders",
                forceRender: true,
                children: (
                  <Row gutter={16}>
                    <Col xs={24} md={12}>
                      <Form.Item label="Delivery order number prefix" name="do_number_prefix" extra="Numbers look like DO-2026-0001." rules={[{ required: true }]}>
                        <Input />
                      </Form.Item>
                    </Col>
                  </Row>
                ),
              },
            ].filter((item) => licensing || item.key === "quotations")}
          />
        </Card>
      </Form>
      {licensing ? <SignatureCard /> : null}
    </>
  );
}
