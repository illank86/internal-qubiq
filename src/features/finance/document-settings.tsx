import { useQuery } from "@tanstack/react-query";
import { Col, Divider, Form, Input, InputNumber, Result, Row, Skeleton } from "antd";
import { RichTextField } from "@/features/content/rich-text-field";
import type { Database } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";
import { PaymentMethodsField } from "@/features/sales/payment-methods-field";
import { SaveBar, useSettingsSave } from "@/features/sales/settings-save";

type Settings = Database["public"]["Tables"]["invoice_settings"]["Row"];

function useInvoiceSettings() {
  return useQuery({
    queryKey: ["sales-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("invoice_settings").select("*").eq("id", true).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

type CompanyValues = Pick<
  Settings,
  "company_name" | "company_email" | "company_address" | "company_phone" | "local_company_name" | "decimal_places" | "footer_note"
>;

/** Our company as printed on quotations, invoices and delivery orders (Finance's). */
export function CompanySettings() {
  const { data, isLoading } = useInvoiceSettings();
  const [form] = Form.useForm<CompanyValues>();
  const { save, pending, error } = useSettingsSave();
  if (isLoading) return <Skeleton active paragraph={{ rows: 6 }} />;
  if (!data) return <Result status="warning" title="The settings could not be loaded." />;
  return (
    <Form<CompanyValues>
      form={form}
      layout="vertical"
      requiredMark="optional"
      disabled={pending}
      initialValues={data}
      onFinish={(values) => save(values, "Saved. New documents print these.")}
    >
      <Row gutter={16}>
        <Col span={24}>
          <Divider titlePlacement="start" style={{ marginTop: 0 }}>
            Our company, as printed on quotations, invoices and delivery orders
          </Divider>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item label="Company name" name="company_name" rules={[{ required: true, whitespace: true, message: "Enter the company name" }, { max: 200 }]}>
            <Input placeholder="QUBIQ Inovasi Digital" />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item label="Company name in Indonesia" name="local_company_name" extra='Printed on documents in IDR. Empty: "PT. " and the company name.' rules={[{ max: 160 }]}>
            <Input placeholder="PT. QUBIQ Teknologi Indonesia" />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item label="Address" name="company_address" rules={[{ max: 500 }]} extra="One line per row, as it should print.">
            <Input.TextArea autoSize={{ minRows: 4, maxRows: 8 }} placeholder={"Street and number\nArea\nCity, province\nCountry"} />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item label="Email" name="company_email" rules={[{ type: "email", message: "Enter a valid email" }]} extra="Printed under our address, e.g. sales@goqubiq.com.">
            <Input />
          </Form.Item>
          <Form.Item label="Phone" name="company_phone" rules={[{ max: 60 }]}>
            <Input />
          </Form.Item>
        </Col>
        <Col span={24}>
          <Divider titlePlacement="start">Documents</Divider>
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
      <SaveBar pending={pending} error={error} onSave={() => form.submit()} />
    </Form>
  );
}

type InvoiceValues = Pick<Settings, "number_prefix" | "payment_terms_days" | "payment_methods" | "bank_details">;

/** Invoice numbering, payment terms and the ways to pay printed on invoices (Finance's). */
export function InvoicePaymentSettings() {
  const { data, isLoading } = useInvoiceSettings();
  const [form] = Form.useForm<InvoiceValues>();
  const { save, pending, error } = useSettingsSave();
  if (isLoading) return <Skeleton active paragraph={{ rows: 6 }} />;
  if (!data) return <Result status="warning" title="The settings could not be loaded." />;
  return (
    <Form<InvoiceValues>
      form={form}
      layout="vertical"
      requiredMark="optional"
      disabled={pending}
      initialValues={data}
      onFinish={(values) => save(values, "Saved. New invoices use these.")}
    >
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
            extra="Printed on the How to pay page of every unpaid invoice — a card per way to pay. Give a way to pay a currency to show it only on invoices in that currency."
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
      <SaveBar pending={pending} error={error} onSave={() => form.submit()} />
    </Form>
  );
}
