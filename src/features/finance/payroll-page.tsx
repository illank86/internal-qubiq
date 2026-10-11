import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Alert, App, Button, Card, Checkbox, Col, Drawer, Empty, Flex, Form, Input, InputNumber, Result, Row, Select, Skeleton, Table, Tabs, Tag, Typography } from "antd";
import type { TableColumnsType } from "antd";
import { EditOutlined, PlusOutlined } from "@ant-design/icons";
import { PageTitle } from "@/components/app-shell";
import { useCan } from "@/auth/use-auth";
import { errorText } from "@/lib/sales";
import { supabase } from "@/lib/supabase";
import { useAction } from "@/features/sales/use-action";
import { idr, jakartaToday } from "./api";
import { YearEnd } from "./payroll-year-end";
import { createPayrollRun, periodLabel, PTKP_LABEL, PTKP_STATUSES, totals, useEmployees, usePayrollRuns, usePayrollSettings, type Employee } from "./payroll-api";

const TABS = ["runs", "employees", "a1", "bpjs"] as const;

/** Payroll: monthly runs, the employees on them, and the BPJS rates. Finance only. */
export function PayrollPage() {
  const can = useCan();
  const [params, setParams] = useSearchParams();
  const tab = TABS.includes(params.get("tab") as (typeof TABS)[number]) ? (params.get("tab") as string) : "runs";
  if (!can("accounting.manage")) return <Result status="403" title="Finance only" />;
  return (
    <>
      <PageTitle title="Payroll" description="Monthly salaries with PPh 21 and BPJS worked out, posted to the books, with a payslip for each employee." />
      <Card>
        <Tabs
          activeKey={tab}
          onChange={(key) => setParams({ tab: key }, { replace: true })}
          items={[
            { key: "runs", label: "Payroll runs", children: <Runs /> },
            { key: "employees", label: "Employees", children: <Employees /> },
            { key: "a1", label: "Year-end (1721-A1)", children: <YearEnd /> },
            { key: "bpjs", label: "BPJS rates", children: <BpjsSettings /> },
          ]}
        />
      </Card>
    </>
  );
}

// ------------------------------------------------------------------ runs

const STATUS_TAG: Record<string, { color: string; label: string }> = {
  draft: { color: "default", label: "Draft" },
  posted: { color: "success", label: "Posted" },
  void: { color: "error", label: "Void" },
};

function Runs() {
  const navigate = useNavigate();
  const { data: runs, isLoading } = usePayrollRuns();
  const { data: employees } = useEmployees();
  const { run, busy } = useAction([["payroll-runs"]]);
  const [month, setMonth] = useState(() => jakartaToday().slice(0, 7));
  const taken = new Set((runs ?? []).filter((item) => item.status !== "void").map((item) => item.period.slice(0, 7)));

  const create = () =>
    run("create", async () => {
      const id = await createPayrollRun(`${month}-01`);
      navigate(`/finance/payroll/${id}`);
    });

  const columns: TableColumnsType<NonNullable<typeof runs>[number]> = [
    { title: "Month", key: "period", render: (_, item) => <Typography.Link onClick={() => navigate(`/finance/payroll/${item.id}`)}>{periodLabel(item.period)}</Typography.Link> },
    { title: "Status", key: "status", render: (_, item) => <Tag color={STATUS_TAG[item.status]?.color}>{STATUS_TAG[item.status]?.label ?? item.status}</Tag> },
    { title: "Employees", key: "people", align: "right", render: (_, item) => item.lines.length },
    { title: "Net pay", key: "net", align: "right", render: (_, item) => idr(totals(item.lines).net) },
    { title: "PPh 21", key: "pph21", align: "right", render: (_, item) => idr(totals(item.lines).pph21) },
    { title: "BPJS (both shares)", key: "bpjs", align: "right", render: (_, item) => idr(totals(item.lines).bpjs) },
    { title: "Paid on", key: "paid", render: (_, item) => item.paid_on ?? "—" },
    {
      title: "BPJS paid",
      key: "bpjs_paid",
      render: (_, item) => (item.status !== "posted" ? "—" : item.bpjs_paid_on ? <Tag color="success">{item.bpjs_paid_on}</Tag> : <Tag color="warning">Not yet</Tag>),
    },
  ];

  return (
    <Flex vertical gap={16}>
      <Flex gap={8} align="center" wrap>
        <Input type="month" value={month} onChange={(event) => setMonth(event.target.value)} style={{ width: 170 }} aria-label="Month" />
        <Button type="primary" icon={<PlusOutlined />} loading={busy === "create"} disabled={!month || taken.has(month) || !(employees ?? []).length} onClick={create}>
          New payroll
        </Button>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {!(employees ?? []).length
            ? "Add employees first (Employees tab)."
            : taken.has(month)
              ? `${periodLabel(`${month}-01`)} already has a payroll.`
              : "Starts a draft with everyone employed that month; review it, then post."}
        </Typography.Text>
      </Flex>
      <Table rowKey="id" size="middle" loading={isLoading} columns={columns} dataSource={runs ?? []} pagination={{ pageSize: 12, hideOnSinglePage: true }} scroll={{ x: 900 }} locale={{ emptyText: <Empty description="No payroll yet" /> }} />
    </Flex>
  );
}

// ------------------------------------------------------------------ employees

const rupiah = {
  min: 0,
  step: 100000,
  style: { width: "100%" },
  formatter: (value: number | string | undefined) => (value === undefined || value === "" ? "" : Number(value).toLocaleString("id-ID")),
  parser: (value: string | undefined) => Number((value ?? "").replace(/[^\d]/g, "")),
  addonBefore: "Rp",
};

function Employees() {
  const { data: employees, isLoading } = useEmployees();
  const [editing, setEditing] = useState<Employee | "new" | null>(null);
  const today = jakartaToday();
  const columns: TableColumnsType<Employee> = [
    {
      title: "Name",
      key: "name",
      render: (_, item) => (
        <div>
          <Typography.Link onClick={() => setEditing(item)}>{item.full_name}</Typography.Link>
          <div style={{ fontSize: 12, opacity: 0.65 }}>{item.position ?? ""}</div>
        </div>
      ),
    },
    { title: "PTKP", dataIndex: "ptkp_status", key: "ptkp" },
    { title: "Type", key: "type", render: (_, item) => (item.employment_type === "permanent" ? "Permanent" : item.pay_basis === "daily" ? "Non-permanent, by the day" : "Non-permanent, monthly") },
    { title: "Base salary", key: "base", align: "right", render: (_, item) => (item.pay_basis === "daily" ? `${idr(item.base_salary)} / day` : idr(item.base_salary)) },
    { title: "Fixed allowance", key: "allowance", align: "right", render: (_, item) => idr(item.fixed_allowance) },
    { title: "BPJS", key: "bpjs", render: (_, item) => [item.bpjs_kesehatan ? "Kesehatan" : null, item.bpjs_ketenagakerjaan ? "Ketenagakerjaan" : null].filter(Boolean).join(", ") || "—" },
    { title: "Joined", dataIndex: "joined_on", key: "joined" },
    { title: "Status", key: "status", render: (_, item) => (item.left_on && item.left_on < today ? <Tag>Left {item.left_on}</Tag> : item.left_on ? <Tag color="warning">Leaving {item.left_on}</Tag> : <Tag color="success">Active</Tag>) },
    { title: <span className="sr-only">Edit</span>, key: "edit", width: 50, render: (_, item) => <Button size="small" type="text" icon={<EditOutlined />} aria-label={`Edit ${item.full_name}`} onClick={() => setEditing(item)} /> },
  ];
  return (
    <Flex vertical gap={16}>
      <Flex justify="space-between" align="center" wrap gap={8}>
        <Typography.Text type="secondary">Salaries here are the starting point of each new payroll; a draft can still be changed per month (bonus, THR, overtime).</Typography.Text>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing("new")}>
          Add employee
        </Button>
      </Flex>
      <Table rowKey="id" size="middle" loading={isLoading} columns={columns} dataSource={employees ?? []} pagination={false} scroll={{ x: 900 }} locale={{ emptyText: <Empty description="No employees yet" /> }} />
      {editing ? <EmployeeDrawer employee={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
    </Flex>
  );
}

type EmployeeValues = Omit<Employee, "id" | "created_at" | "updated_at">;

function EmployeeDrawer({ employee, onClose }: { employee: Employee | null; onClose: () => void }) {
  const [form] = Form.useForm<EmployeeValues>();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const employment = Form.useWatch("employment_type", form) ?? employee?.employment_type ?? "permanent";
  const basis = Form.useWatch("pay_basis", form) ?? employee?.pay_basis ?? "monthly";

  const save = async (values: EmployeeValues) => {
    setPending(true);
    setError(null);
    const clean = (value: string | null | undefined) => value?.trim() || null;
    const row = {
      ...values,
      full_name: values.full_name.trim(),
      nik: clean(values.nik)?.replace(/\D/g, "") || null,
      npwp: clean(values.npwp)?.replace(/\D/g, "") || null,
      email: clean(values.email),
      position: clean(values.position),
      left_on: values.left_on || null,
      bpjs_kesehatan_number: clean(values.bpjs_kesehatan_number),
      bpjs_ketenagakerjaan_number: clean(values.bpjs_ketenagakerjaan_number),
      bank_name: clean(values.bank_name),
      bank_account_number: clean(values.bank_account_number),
      bank_account_name: clean(values.bank_account_name),
      notes: clean(values.notes),
      base_salary: values.base_salary ?? 0,
      pay_basis: values.employment_type === "permanent" ? "monthly" : values.pay_basis,
      fixed_allowance: values.fixed_allowance ?? 0,
    };
    const { error: saveError } = employee
      ? await supabase.from("employees").update({ ...row, updated_at: new Date().toISOString() }).eq("id", employee.id)
      : await supabase.from("employees").insert(row);
    setPending(false);
    if (saveError) return setError(errorText(saveError, "The employee could not be saved."));
    await queryClient.invalidateQueries({ queryKey: ["employees"] });
    message.success(employee ? "Employee saved." : "Employee added.");
    onClose();
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={employee ? employee.full_name : "Add employee"}
      size={640}
      destroyOnHidden
      extra={
        <Button type="primary" loading={pending} onClick={() => form.submit()}>
          Save
        </Button>
      }
    >
      <Form<EmployeeValues>
        form={form}
        layout="vertical"
        requiredMark="optional"
        onFinish={save}
        disabled={pending}
        initialValues={employee ?? { joined_on: jakartaToday(), ptkp_status: "TK/0", employment_type: "permanent", pay_basis: "monthly", base_salary: 0, fixed_allowance: 0, bpjs_kesehatan: true, bpjs_ketenagakerjaan: true }}
      >
        <Row gutter={16}>
          <Col xs={24} sm={14}>
            <Form.Item label="Full name" name="full_name" rules={[{ required: true, min: 2, message: "The employee's name" }]}>
              <Input maxLength={120} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={10}>
            <Form.Item label="Position" name="position">
              <Input maxLength={120} placeholder="e.g. Software engineer" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item label="NIK" name="nik" extra="16 digits; it is also the NPWP for PPh 21." rules={[{ pattern: /^\s*\d{16}\s*$/, message: "16 digits" }]}>
              <Input inputMode="numeric" maxLength={16} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item label="Email" name="email" rules={[{ type: "email", message: "An email address" }]} extra="For sending the payslip.">
              <Input maxLength={200} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item label="Joined on" name="joined_on" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item label="Left on" name="left_on" extra="That month's payroll settles the year's PPh 21.">
              <Input type="date" />
            </Form.Item>
          </Col>
        </Row>
        <Typography.Title level={5}>Pay and tax</Typography.Title>
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item label="Employment" name="employment_type" extra={employment === "permanent" ? "PPh 21 by TER; December settles the year." : "“Pegawai tidak tetap”: TER each month, no year-end settlement."}>
              <Select
                options={[
                  { value: "permanent", label: "Permanent (“pegawai tetap”)" },
                  { value: "non_permanent", label: "Non-permanent (“pegawai tidak tetap”)" },
                ]}
                onChange={(value) => value === "permanent" && form.setFieldValue("pay_basis", "monthly")}
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item label="Paid" name="pay_basis" extra={basis === "daily" ? "Daily TER: 0% up to Rp450,000 a day, 0.5% up to Rp2,500,000." : undefined}>
              <Select disabled={employment === "permanent"} options={[{ value: "monthly", label: "Monthly" }, { value: "daily", label: "By the day" }]} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item label={basis === "daily" ? "Day rate" : "Base salary (monthly)"} name="base_salary" rules={[{ required: true }]}>
              <InputNumber {...rupiah} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item label="Fixed allowance (monthly)" name="fixed_allowance" extra="“Tunjangan tetap”; counts toward the BPJS wage.">
              <InputNumber {...rupiah} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item label="PTKP status" name="ptkp_status" rules={[{ required: true }]} extra="As on 1 January of the year.">
              <Select options={PTKP_STATUSES.map((value) => ({ value, label: PTKP_LABEL[value] }))} />
            </Form.Item>
          </Col>
        </Row>
        <Typography.Title level={5}>BPJS</Typography.Title>
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item name="bpjs_kesehatan" valuePropName="checked" style={{ marginBottom: 8 }}>
              <Checkbox>BPJS Kesehatan</Checkbox>
            </Form.Item>
            <Form.Item label="Number" name="bpjs_kesehatan_number">
              <Input maxLength={40} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="bpjs_ketenagakerjaan" valuePropName="checked" style={{ marginBottom: 8 }}>
              <Checkbox>BPJS Ketenagakerjaan (JHT, JP, JKK, JKM)</Checkbox>
            </Form.Item>
            <Form.Item label="Number" name="bpjs_ketenagakerjaan_number">
              <Input maxLength={40} />
            </Form.Item>
          </Col>
        </Row>
        <Typography.Title level={5}>Paid into</Typography.Title>
        <Row gutter={16}>
          <Col xs={24} sm={8}>
            <Form.Item label="Bank" name="bank_name">
              <Input maxLength={80} placeholder="e.g. BCA" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8}>
            <Form.Item label="Account number" name="bank_account_number">
              <Input maxLength={40} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8}>
            <Form.Item label="Account name" name="bank_account_name">
              <Input maxLength={120} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item label="Notes" name="notes">
          <Input.TextArea autoSize={{ minRows: 2 }} maxLength={1000} />
        </Form.Item>
        {error ? <Alert type="error" showIcon title={error} /> : null}
      </Form>
    </Drawer>
  );
}

// ------------------------------------------------------------------ BPJS settings

type BpjsValues = { minimum_wage: number | null; jht_employer: number; jht_employee: number; jp_employer: number; jp_employee: number; jp_wage_cap: number; jkk_rate: number; jkm_rate: number; kes_employer: number; kes_employee: number; kes_wage_cap: number };

function BpjsSettings() {
  const [form] = Form.useForm<BpjsValues>();
  const { data, isLoading } = usePayrollSettings();
  const { run, busy } = useAction([["payroll-settings"]]);
  if (isLoading) return <Skeleton active />;
  if (!data) return <Result status="warning" title="The BPJS rates could not be loaded." />;
  const percent = { min: 0, max: 20, step: 0.01, addonAfter: "%", style: { width: "100%" } };
  const save = (values: BpjsValues) =>
    run("save", async () => {
      const { error } = await supabase.from("payroll_settings").update({ ...values, updated_at: new Date().toISOString() }).eq("id", true);
      if (error) throw error;
    }, "BPJS rates saved. Drafts pick them up when refreshed; posted months keep theirs.");
  const pair = (title: string, employer: keyof BpjsValues, employee: keyof BpjsValues | null, cap: keyof BpjsValues | null, hint: string) => (
    <Col xs={24} md={12}>
      <Card size="small" title={title} style={{ height: "100%" }}>
        <Row gutter={12}>
          <Col span={employee ? 12 : 24}>
            <Form.Item label="Company" name={employer}>
              <InputNumber {...percent} />
            </Form.Item>
          </Col>
          {employee ? (
            <Col span={12}>
              <Form.Item label="Employee" name={employee}>
                <InputNumber {...percent} />
              </Form.Item>
            </Col>
          ) : null}
          {cap ? (
            <Col span={24}>
              <Form.Item label="Wage cap (monthly)" name={cap}>
                <InputNumber {...rupiah} step={1000} />
              </Form.Item>
            </Col>
          ) : null}
        </Row>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {hint}
        </Typography.Text>
      </Card>
    </Col>
  );
  return (
    <Form<BpjsValues> form={form} layout="vertical" initialValues={data as unknown as BpjsValues} onFinish={save} style={{ maxWidth: 900 }}>
      <Typography.Paragraph type="secondary">
        Percent of the wage (base salary + fixed allowance). The government revises the JP wage cap each year (Rp11,086,300 for 2026); BPJS Kesehatan counts the wage up to Rp12,000,000.
      </Typography.Paragraph>
      <Card size="small" title="Minimum wage (UMK)" style={{ marginBottom: 16, maxWidth: 440 }}>
        <Form.Item name="minimum_wage" extra="The UMK (or UMP) where your people work. BPJS is counted on at least this; a monthly salary below it is flagged." style={{ marginBottom: 0 }}>
          <InputNumber {...rupiah} step={1000} placeholder="e.g. 5,400,000" />
        </Form.Item>
      </Card>
      <Row gutter={[16, 16]}>
        {pair("BPJS Kesehatan", "kes_employer", "kes_employee", "kes_wage_cap", "Health insurance: 4% company, 1% employee.")}
        {pair("JHT — Jaminan Hari Tua", "jht_employer", "jht_employee", null, "Old-age savings: 3.7% company, 2% employee; no cap.")}
        {pair("JP — Jaminan Pensiun", "jp_employer", "jp_employee", "jp_wage_cap", "Pension: 2% company, 1% employee, up to the cap.")}
        {pair("JKK — Jaminan Kecelakaan Kerja", "jkk_rate", null, null, "Work accident, company only: 0.24% for very low risk (office work), up to 1.74%.")}
        {pair("JKM — Jaminan Kematian", "jkm_rate", null, null, "Death benefit, company only: 0.30%.")}
      </Row>
      <Button type="primary" htmlType="submit" loading={busy === "save"} style={{ marginTop: 16 }}>
        Save
      </Button>
    </Form>
  );
}
