import { useState } from "react";
import { useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, App, Button, Card, Col, Form, Input, InputNumber, Result, Row, Skeleton, Tabs } from "antd";
import { SaveOutlined } from "@ant-design/icons";
import { PageTitle } from "@/components/app-shell";
import type { Database } from "@/lib/database.types";
import { errorText } from "@/lib/sales";
import { supabase } from "@/lib/supabase";

type Settings = Database["public"]["Tables"]["invoice_settings"]["Row"];
type Values = Omit<Settings, "id" | "updated_at">;

const TAB_KEYS = ["general", "invoices", "quotations"] as const;

/**
 * Defaults for invoices and quotations. General holds what both documents
 * print or compute the same way; each document's tab holds only its own.
 * Our company name, address, email and phone come from Site settings.
 */
export function SalesSettingsPage() {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [form] = Form.useForm<Values>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tab = TAB_KEYS.includes(params.get("tab") as (typeof TAB_KEYS)[number]) ? (params.get("tab") as string) : "general";

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
    const { error: saveError } = await supabase.from("invoice_settings").update(values).eq("id", true);
    setPending(false);
    if (saveError) return setError(errorText(saveError, "The settings could not be saved."));
    await Promise.all(["sales-settings", "sales-catalog"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
    message.success("Saved. New invoices and quotations use these.");
  };

  const { id: _id, updated_at: _updated, ...initialValues } = data;

  return (
    <>
      <PageTitle
        title="Sales settings"
        description="Defaults for invoices and quotations. Our company name, address, email and phone come from Site settings — the same details the website shows."
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
                      <Form.Item label="Our tax ID (NPWP / VAT number)" name="tax_id" extra="Printed with our address.">
                        <Input />
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
                        label="How to pay"
                        name="bank_details"
                        extra="Markdown, printed on unpaid invoices. Several banks? Separate them with a horizontal line (---) or start each with a heading, and they print side by side."
                      >
                        <Input.TextArea rows={8} />
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
                      <Form.Item label="Default terms & conditions" name="quote_terms" extra="Markdown. Printed on every new quotation, and editable on each one.">
                        <Input.TextArea rows={10} />
                      </Form.Item>
                    </Col>
                  </Row>
                ),
              },
            ]}
          />
        </Card>
      </Form>
    </>
  );
}
