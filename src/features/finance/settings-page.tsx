import { useState } from "react";
import { useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, App, Button, Card, Checkbox, Col, Divider, Flex, Form, Input, InputNumber, Modal, Popconfirm, Result, Row, Segmented, Select, Skeleton, Switch, Table, Tabs, Tag, Typography } from "antd";
import { DeleteOutlined, EditOutlined, ExportOutlined, PlusOutlined, SaveOutlined } from "@ant-design/icons";
import { PageTitle } from "@/components/app-shell";
import { errorText } from "@/lib/sales";
import { supabase } from "@/lib/supabase";
import { useAction } from "@/features/sales/use-action";
import { CompanySettings, InvoicePaymentSettings } from "./document-settings";
import { ReportSettings } from "./report-settings";
import { money, useAccounts, useBankAccounts, type Account, type BankAccount } from "./api";
import { DateInput } from "@/components/date-input";

const TABS = ["company", "invoices", "tax", "reports", "accounts", "banks", "rates"] as const;

/** Finance settings: the tax profile (and the tax used on quotations and invoices), the chart of accounts, bank accounts and KMK exchange rates. */
export function FinanceSettingsPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.includes(params.get("tab") as (typeof TABS)[number]) ? (params.get("tab") as string) : "company";
  return (
    <>
      <PageTitle title="Finance settings" description="Company details, invoices and ways to pay, tax, who signs the reports, chart of accounts, bank accounts and exchange rates." />
      <Card>
        <Tabs
          activeKey={tab}
          onChange={(key) => setParams({ tab: key }, { replace: true })}
          items={[
            { key: "company", label: "Company & documents", children: <CompanySettings /> },
            { key: "invoices", label: "Invoices & payment", children: <InvoicePaymentSettings /> },
            { key: "tax", label: "Tax", children: <TaxSettings /> },
            { key: "reports", label: "Reports", children: <ReportSettings /> },
            { key: "accounts", label: "Chart of accounts", children: <AccountsTab /> },
            { key: "banks", label: "Bank accounts", children: <BanksTab /> },
            { key: "rates", label: "Exchange rates (KMK)", children: <RatesTab /> },
          ]}
        />
      </Card>
    </>
  );
}

// ------------------------------------------------------------------- tax

type TaxValues = {
  legal_name: string;
  npwp: string;
  nitku: string;
  tax_registered_on: string;
  income_tax_regime: "general" | "pp55";
  pp55_until: string;
  pkp: boolean;
  pkp_since: string;
  ppn_rate: number;
  pph25_monthly: number;
  corporate_rate: number;
  facility_31e_threshold: number;
  tax_label: string;
  tax_rate: number;
  tax_id_label: string;
  reporting_currency: string;
  faktur_supply_type: "A" | "B";
  faktur_item_code: string;
  faktur_unit: string;
};

function TaxSettings() {
  const [form] = Form.useForm<TaxValues>();
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pkp = Form.useWatch("pkp", form);
  const regime = Form.useWatch("income_tax_regime", form);

  const { data, isLoading } = useQuery({
    queryKey: ["finance-tax-settings"],
    queryFn: async () => {
      const [{ data: accounting, error: aError }, { data: invoice, error: iError }, { data: documents }] = await Promise.all([
        supabase.from("accounting_settings").select("*").eq("id", true).maybeSingle(),
        supabase.from("invoice_settings").select("tax_label, tax_rate, tax_id, tax_id_label, reporting_currency").eq("id", true).maybeSingle(),
        supabase.rpc("tax_before_pkp_documents"),
      ]);
      if (aError) throw aError;
      if (iError) throw iError;
      return { accounting, invoice, documents: (documents ?? []) as unknown as { type: string; number: string; status: string; customer: string; tax_rate: number; tax_amount: number; currency: string }[] };
    },
  });
  if (isLoading) return <Skeleton active paragraph={{ rows: 8 }} />;
  if (!data?.accounting || !data.invoice) return <Result status="warning" title="The tax settings could not be loaded." />;
  const a = data.accounting;
  const i = data.invoice;
  // PPN on documents: 12% × 11/12 = 11% effective (PMK 131/2024) for ordinary supplies.
  const effective = Math.round(((Number(a.ppn_rate) * a.ppn_dpp_numerator) / a.ppn_dpp_denominator) * 100) / 100;

  const save = async (values: TaxValues) => {
    setPending(true);
    setError(null);
    // Turning PKP on first, so the invoice tax rate may then be set above 0 (and the reverse).
    const accounting = {
      legal_name: values.legal_name?.trim() || null,
      npwp: values.npwp?.replace(/\D/g, "") || null,
      nitku: values.nitku?.replace(/\D/g, "") || null,
      tax_registered_on: values.tax_registered_on || null,
      income_tax_regime: values.income_tax_regime,
      pp55_until: values.income_tax_regime === "pp55" ? values.pp55_until || null : null,
      pkp: values.pkp,
      pkp_since: values.pkp ? values.pkp_since || null : null,
      ppn_rate: values.ppn_rate,
      pph25_monthly: values.pph25_monthly ?? 0,
      corporate_rate: values.corporate_rate,
      facility_31e_threshold: values.facility_31e_threshold,
      faktur_supply_type: values.faktur_supply_type,
      faktur_item_code: values.faktur_item_code,
      faktur_unit: values.faktur_unit,
    };
    const invoice = {
      tax_label: values.tax_label,
      tax_rate: values.pkp ? values.tax_rate : 0,
      tax_id: values.npwp?.replace(/\D/g, "") || null,
      tax_id_label: values.tax_id_label,
      reporting_currency: values.reporting_currency,
    };
    const first = values.pkp
      ? await supabase.from("accounting_settings").update(accounting).eq("id", true)
      : await supabase.from("invoice_settings").update(invoice).eq("id", true);
    const second = first.error
      ? first
      : values.pkp
        ? await supabase.from("invoice_settings").update(invoice).eq("id", true)
        : await supabase.from("accounting_settings").update(accounting).eq("id", true);
    setPending(false);
    if (second.error) return setError(errorText(second.error, "The tax settings could not be saved."));
    await Promise.all(["finance-tax-settings", "accounting-settings", "sales-settings", "sales-catalog", "finance-dashboard", "sales-money"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
    message.success("Tax settings saved. New quotations and invoices use them.");
  };

  const confirmPkp = (checked: boolean) => {
    if (!checked) return form.setFieldsValue({ pkp: false, tax_rate: 0 });
    modal.confirm({
      title: "Turn on PKP?",
      content: `From then on, new quotations and invoices charge PPN at ${effective}% (${Number(a.ppn_rate)}% × ${a.ppn_dpp_numerator}/${a.ppn_dpp_denominator}), and every invoice needs its “faktur pajak” from Coretax. Only do this once DJP has confirmed you as PKP.`,
      okText: "Turn on PKP",
      onOk: () => form.setFieldsValue({ pkp: true, tax_rate: effective, tax_label: form.getFieldValue("tax_label") || "PPN" }),
    });
  };

  return (
    <Form<TaxValues>
      form={form}
      layout="vertical"
      onFinish={save}
      disabled={pending}
      initialValues={{
        legal_name: a.legal_name ?? "",
        npwp: a.npwp ?? i.tax_id ?? "",
        nitku: a.nitku ?? "",
        tax_registered_on: a.tax_registered_on ?? "",
        income_tax_regime: a.income_tax_regime as "general" | "pp55",
        pp55_until: a.pp55_until ?? "",
        pkp: a.pkp,
        pkp_since: a.pkp_since ?? "",
        ppn_rate: Number(a.ppn_rate),
        pph25_monthly: Number(a.pph25_monthly),
        corporate_rate: Number(a.corporate_rate),
        facility_31e_threshold: Number(a.facility_31e_threshold),
        tax_label: i.tax_label,
        tax_rate: Number(i.tax_rate),
        tax_id_label: i.tax_id_label ?? "NPWP",
        reporting_currency: i.reporting_currency ?? "IDR",
        faktur_supply_type: (a.faktur_supply_type as "A" | "B") ?? "A",
        faktur_item_code: a.faktur_item_code ?? "000000",
        faktur_unit: a.faktur_unit ?? "UM.0033",
      }}
    >
      <Divider titlePlacement="start" style={{ marginTop: 0 }}>
        Company
      </Divider>
      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item label="Legal name" name="legal_name" extra="As registered, e.g. PT QUBIQ Inovasi Digital." rules={[{ max: 200 }]}>
            <Input />
          </Form.Item>
        </Col>
        <Col xs={24} md={6}>
          <Form.Item label="NPWP" name="npwp" extra="16 digits; printed on invoices." rules={[{ pattern: /^[0-9.\-\s]{15,22}$/, message: "15–16 digits" }]}>
            <Input />
          </Form.Item>
        </Col>
        <Col xs={24} md={6}>
          <Form.Item label="Label on documents" name="tax_id_label" extra="e.g. NPWP">
            <Input />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item label="NITKU" name="nitku" extra="22 digits (Coretax), optional." rules={[{ pattern: /^[0-9.\-\s]{22,30}$/, message: "22 digits" }]}>
            <Input />
          </Form.Item>
        </Col>
        <Col xs={24} md={6}>
          <Form.Item label="Registered for tax on" name="tax_registered_on">
            <DateInput />
          </Form.Item>
        </Col>
        <Col xs={24} md={6}>
          <Form.Item label="Reporting currency" name="reporting_currency" extra="The dashboard default.">
            <Select options={[{ value: "IDR", label: "IDR" }, { value: "USD", label: "USD" }]} />
          </Form.Item>
        </Col>
      </Row>

      <Divider titlePlacement="start">Income tax</Divider>
      <Form.Item name="income_tax_regime">
        <Segmented
          options={[
            { value: "general", label: "Normal corporate tax (22%, Article 31E)" },
            { value: "pp55", label: "PPh final 0.5% (PP 55)" },
          ]}
        />
      </Form.Item>
      <Typography.Paragraph type="secondary" style={{ marginTop: -12 }}>
        {regime === "pp55"
          ? "0.5% of monthly revenue, paid by the 15th of the next month. Since PP 20/2026, ordinary PTs only keep this for the rest of their original 3 years if registered before it; confirm with your tax consultant."
          : "Tax on profit: 22%, halved (Article 31E) on the part of taxable income from revenue up to the threshold. Monthly PPh 25 instalments are set by the last annual return (0 in the first year)."}
      </Typography.Paragraph>
      <Row gutter={16}>
        {regime === "pp55" ? (
          <Col xs={24} md={8}>
            <Form.Item label="0.5% allowed until" name="pp55_until">
              <DateInput />
            </Form.Item>
          </Col>
        ) : (
          <>
            <Col xs={24} md={8}>
              <Form.Item label="PPh 25 per month" name="pph25_monthly">
                <InputNumber min={0} suffix="IDR" style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col xs={12} md={8}>
              <Form.Item label="Corporate rate" name="corporate_rate">
                <InputNumber min={0} max={100} suffix="%" style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col xs={12} md={8}>
              <Form.Item label="Article 31E revenue threshold" name="facility_31e_threshold">
                <InputNumber min={0} suffix="IDR" style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </>
        )}
      </Row>

      <Divider titlePlacement="start">PPN (VAT)</Divider>
      <Flex align="center" gap={12} style={{ marginBottom: 12 }}>
        <Form.Item name="pkp" valuePropName="checked" noStyle>
          <Switch onChange={confirmPkp} />
        </Form.Item>
        <div>
          <Typography.Text strong>{pkp ? "PKP — we charge PPN" : "Not PKP — no PPN"}</Typography.Text>
          <Typography.Text type="secondary" style={{ display: "block", fontSize: 12 }}>
            {pkp
              ? "Invoices charge PPN and need their “faktur pajak” from Coretax."
              : "Quotations and invoices print “Not VAT-registered (belum PKP)”. Becoming PKP is required once revenue passes Rp4.8bn a year."}
          </Typography.Text>
        </div>
      </Flex>
      {pkp ? (
        <Row gutter={16}>
          <Col xs={24} md={6}>
            <Form.Item label="PKP since" name="pkp_since" rules={[{ required: true, message: "The PKP date" }]}>
              <DateInput />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item label="Tax name" name="tax_label">
              <Input />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item label="Rate on documents" name="tax_rate" extra={`${Number(a.ppn_rate)}% × ${a.ppn_dpp_numerator}/${a.ppn_dpp_denominator} = ${effective}%`}>
              <InputNumber min={0} max={100} suffix="%" style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item label="PPN rate" name="ppn_rate">
              <InputNumber min={0} max={100} suffix="%" style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item label="On the “faktur pajak”, we supply" name="faktur_supply_type" extra="A software licence is an intangible good (A); choose B if you invoice services.">
              <Segmented options={[{ value: "A", label: "Goods, incl. licences (A)" }, { value: "B", label: "Services (B)" }]} />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item label="Goods/service code" name="faktur_item_code" extra="000000 when there is no specific code." rules={[{ pattern: /^[0-9]{6}$/, message: "6 digits" }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col xs={12} md={6}>
            <Form.Item label="Unit code" name="faktur_unit" extra="UM.0033 = other.">
              <Input />
            </Form.Item>
          </Col>
        </Row>
      ) : null}

      {!pkp && data.documents.length ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          title="Documents that charge tax while not PKP"
          description={
            <Flex vertical gap={4}>
              <Typography.Text type="secondary">A non-PKP company may not collect PPN. Void and re-issue these at 0%, and agree with your tax consultant how to treat what was already paid.</Typography.Text>
              {data.documents.map((doc) => (
                <Typography.Text key={doc.number}>
                  <Tag style={{ marginInlineEnd: 6 }}>{doc.type === "invoice" ? "Invoice" : "Quotation"}</Tag>
                  {doc.number} · {doc.customer} · {doc.tax_rate}% = {money(doc.tax_amount, doc.currency)} · {doc.status}
                </Typography.Text>
              ))}
            </Flex>
          }
        />
      ) : null}
      {error ? <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} /> : null}
      <Button type="primary" icon={<SaveOutlined />} loading={pending} onClick={() => form.submit()}>
        Save tax settings
      </Button>
    </Form>
  );
}

// ------------------------------------------------------- chart of accounts

const TYPE_LABEL: Record<string, string> = { asset: "Asset", liability: "Liability", equity: "Equity", income: "Income", expense: "Expense" };

function AccountsTab() {
  const { data, isLoading } = useAccounts();
  const [editing, setEditing] = useState<Account | "new" | null>(null);
  return (
    <Flex vertical gap={12}>
      <Flex justify="space-between" align="center" wrap gap={8}>
        <Typography.Text type="secondary">Names in English for the app; the Indonesian name is used in reports for the tax office.</Typography.Text>
        <Button icon={<PlusOutlined />} onClick={() => setEditing("new")}>
          Add account
        </Button>
      </Flex>
      <Table<Account>
        rowKey="id"
        size="small"
        loading={isLoading}
        dataSource={data ?? []}
        pagination={false}
        columns={[
          { title: "Code", dataIndex: "code", width: 90, render: (value: string) => <Typography.Text style={{ fontFamily: "Geist Mono, monospace" }}>{value}</Typography.Text> },
          {
            title: "Account",
            key: "name",
            render: (_, account) => (
              <Flex vertical>
                <Typography.Text delete={!account.active}>{account.name}</Typography.Text>
                {account.name_id ? <Typography.Text type="secondary" style={{ fontSize: 12 }}>{account.name_id}</Typography.Text> : null}
              </Flex>
            ),
          },
          { title: "Type", dataIndex: "type", width: 100, render: (value: string) => TYPE_LABEL[value] ?? value },
          {
            title: "Tax",
            key: "deductible",
            width: 130,
            render: (_, account) => (account.type === "expense" ? (account.deductible ? <Tag>Deductible</Tag> : <Tag color="warning">Not deductible</Tag>) : null),
          },
          { title: <span className="sr-only">Edit</span>, key: "edit", width: 50, render: (_, account) => <Button size="small" type="text" icon={<EditOutlined />} aria-label={`Edit ${account.name}`} onClick={() => setEditing(account)} /> },
        ]}
      />
      {editing ? <AccountModal account={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
    </Flex>
  );
}

function AccountModal({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const [form] = Form.useForm<{ code: string; name: string; name_id: string; type: string; deductible: boolean; active: boolean }>();
  const { run, busy } = useAction([["accounts"]]);
  return (
    <Modal open onCancel={onClose} title={account ? `Edit ${account.code}` : "Add account"} okText="Save" okButtonProps={{ loading: busy === "account" }} onOk={() => form.submit()} destroyOnHidden>
      <Form
        form={form}
        layout="vertical"
        initialValues={account ?? { type: "expense", deductible: true, active: true }}
        onFinish={(values) =>
          run("account", async () => {
            const row = { name: values.name.trim(), name_id: values.name_id?.trim() || null, deductible: values.deductible, active: values.active };
            const { error } = account
              ? await supabase.from("accounts").update(row).eq("id", account.id)
              : await supabase.from("accounts").insert({ ...row, code: values.code.trim(), type: values.type });
            if (error) throw error.code === "23505" ? { code: "22023", message: "That code is taken." } : error;
          }, "Account saved.").then((ok) => ok && onClose())
        }
      >
        {!account ? (
          <Row gutter={12}>
            <Col span={10}>
              <Form.Item label="Code" name="code" rules={[{ required: true, pattern: /^[0-9]-[0-9]{4}$/, message: "e.g. 5-2300" }]}>
                <Input placeholder="5-2300" />
              </Form.Item>
            </Col>
            <Col span={14}>
              <Form.Item label="Type" name="type">
                <Select options={Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }))} />
              </Form.Item>
            </Col>
          </Row>
        ) : null}
        <Form.Item label="Name (English)" name="name" rules={[{ required: true, whitespace: true }, { max: 120 }]}>
          <Input />
        </Form.Item>
        <Form.Item label="Name in reports (Bahasa Indonesia)" name="name_id" rules={[{ max: 120 }]}>
          <Input />
        </Form.Item>
        <Flex gap={16}>
          <Form.Item name="deductible" valuePropName="checked" style={{ marginBottom: 0 }}>
            <Checkbox>Deductible for tax</Checkbox>
          </Form.Item>
          <Form.Item name="active" valuePropName="checked" style={{ marginBottom: 0 }}>
            <Checkbox>In use</Checkbox>
          </Form.Item>
        </Flex>
        {account?.role ? <Typography.Text type="secondary" style={{ fontSize: 12 }}>Used by the system ({account.role}); its type stays.</Typography.Text> : null}
      </Form>
    </Modal>
  );
}

// ------------------------------------------------------------ bank accounts

function BanksTab() {
  const { data, isLoading } = useBankAccounts();
  const { run } = useAction([["bank-accounts"], ["finance-dashboard"]]);
  const [adding, setAdding] = useState(false);
  const [form] = Form.useForm<{ name: string; bank_name: string; account_last4: string; currency: string }>();
  return (
    <Flex vertical gap={12}>
      <Flex justify="space-between" align="center" wrap gap={8}>
        <Typography.Text type="secondary">Where money arrives and leaves. Each gets its own ledger account.</Typography.Text>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setAdding(true)}>
          Add bank account
        </Button>
      </Flex>
      <Table<BankAccount>
        rowKey="id"
        loading={isLoading}
        dataSource={data ?? []}
        pagination={false}
        locale={{ emptyText: "No bank accounts yet. Add the company's account to record payments." }}
        columns={[
          { title: "Name", dataIndex: "name" },
          { title: "Bank", key: "bank", render: (_, bank) => `${bank.bank_name ?? ""}${bank.account_last4 ? ` ··${bank.account_last4}` : ""}` },
          { title: "Currency", dataIndex: "currency", width: 100 },
          {
            title: "In use",
            key: "active",
            width: 90,
            render: (_, bank) => (
              <Switch size="small" checked={bank.active} onChange={(checked) => run(`bank:${bank.id}`, async () => {
                const { error } = await supabase.from("bank_accounts").update({ active: checked }).eq("id", bank.id);
                if (error) throw error;
              })} />
            ),
          },
        ]}
      />
      <Modal open={adding} onCancel={() => setAdding(false)} title="Add bank account" okText="Add" onOk={() => form.submit()} destroyOnHidden>
        <Form
          form={form}
          layout="vertical"
          initialValues={{ currency: "IDR" }}
          onFinish={(values) =>
            run("bank", async () => {
              const { error } = await supabase.from("bank_accounts").insert({ name: values.name.trim(), bank_name: values.bank_name?.trim() || null, account_last4: values.account_last4?.trim() || null, currency: values.currency });
              if (error) throw error;
            }, "Bank account added.").then((ok) => ok && setAdding(false))
          }
        >
          <Form.Item label="Name" name="name" rules={[{ required: true, whitespace: true }, { max: 80 }]}>
            <Input placeholder="e.g. BCA Operational" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={10}>
              <Form.Item label="Bank" name="bank_name">
                <Input placeholder="BCA" />
              </Form.Item>
            </Col>
            <Col span={7}>
              <Form.Item label="Last digits" name="account_last4" rules={[{ pattern: /^[0-9]{2,6}$/, message: "2–6 digits" }]}>
                <Input placeholder="1234" />
              </Form.Item>
            </Col>
            <Col span={7}>
              <Form.Item label="Currency" name="currency">
                <Select options={["IDR", "USD", "SGD", "EUR"].map((value) => ({ value }))} />
              </Form.Item>
            </Col>
          </Row>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Only the last digits are kept, never the full account number.
          </Typography.Text>
        </Form>
      </Modal>
    </Flex>
  );
}

// ------------------------------------------------------------- KMK rates

type Rate = { currency: string; valid_from: string; valid_to: string; rate: number; reference: string | null };

function RatesTab() {
  const { run } = useAction([["kmk-rates"]]);
  const [adding, setAdding] = useState(false);
  const [form] = Form.useForm<Rate>();
  const { data, isLoading } = useQuery({
    queryKey: ["kmk-rates"],
    queryFn: async () => {
      const { data: rows, error } = await supabase.from("kmk_rates").select("*").order("valid_from", { ascending: false }).limit(200);
      if (error) throw error;
      return (rows ?? []) as Rate[];
    },
  });
  return (
    <Flex vertical gap={12}>
      <Alert
        type="info"
        showIcon
        title="Kurs Menteri Keuangan (KMK)"
        description={
          <>
            Foreign-currency amounts are booked at the weekly KMK rate (required for tax). Without one, an ECB-based estimate is used and flagged.{" "}
            <Typography.Link href="https://fiskal.kemenkeu.go.id/informasi-publik/kurs-pajak" target="_blank" rel="noreferrer">
              Kemenkeu kurs pajak <ExportOutlined />
            </Typography.Link>
          </>
        }
      />
      <Flex justify="flex-end">
        <Button icon={<PlusOutlined />} onClick={() => setAdding(true)}>
          Add week's rate
        </Button>
      </Flex>
      <Table<Rate>
        rowKey={(row) => `${row.currency}-${row.valid_from}`}
        size="small"
        loading={isLoading}
        dataSource={data ?? []}
        pagination={{ pageSize: 20, hideOnSinglePage: true }}
        locale={{ emptyText: "No KMK rates yet." }}
        columns={[
          { title: "Currency", dataIndex: "currency", width: 90 },
          { title: "Valid", key: "valid", render: (_, row) => `${row.valid_from} → ${row.valid_to}` },
          { title: "Rupiah per unit", key: "rate", align: "right", render: (_, row) => Number(row.rate).toLocaleString("en-US") },
          { title: "KMK", dataIndex: "reference", responsive: ["md"] },
          {
            title: <span className="sr-only">Delete</span>,
            key: "delete",
            width: 50,
            render: (_, row) => (
              <Popconfirm title="Delete this rate?" onConfirm={() => run("rate-delete", async () => {
                const { error } = await supabase.from("kmk_rates").delete().eq("currency", row.currency).eq("valid_from", row.valid_from);
                if (error) throw error;
              })}>
                <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label="Delete rate" />
              </Popconfirm>
            ),
          },
        ]}
      />
      <Modal open={adding} onCancel={() => setAdding(false)} title="Add KMK rate" okText="Add" onOk={() => form.submit()} destroyOnHidden>
        <Form
          form={form}
          layout="vertical"
          initialValues={{ currency: "USD" }}
          onFinish={(values) =>
            run("rate", async () => {
              const { error } = await supabase.from("kmk_rates").insert({ ...values, currency: values.currency.toUpperCase() });
              if (error) throw error.code === "23505" ? { code: "22023", message: "That week already has a rate." } : error;
            }, "Rate added.").then((ok) => ok && setAdding(false))
          }
        >
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item label="Currency" name="currency" rules={[{ required: true, pattern: /^[A-Za-z]{3}$/ }]}>
                <Input maxLength={3} />
              </Form.Item>
            </Col>
            <Col span={16}>
              <Form.Item label="Rupiah per 1 unit" name="rate" rules={[{ required: true, type: "number", min: 0.0001 }]}>
                <InputNumber min={0} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Valid from" name="valid_from" rules={[{ required: true }]}>
                <DateInput />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Valid to" name="valid_to" rules={[{ required: true }]}>
                <DateInput />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="KMK number" name="reference">
            <Input placeholder="e.g. 48/MK/EF.2/2026" />
          </Form.Item>
        </Form>
      </Modal>
    </Flex>
  );
}
