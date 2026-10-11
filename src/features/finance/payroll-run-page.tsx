import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import { Alert, App, Button, Card, Checkbox, Col, Descriptions, Flex, Form, Input, InputNumber, Modal, Popconfirm, Progress, Result, Row, Select, Skeleton, Statistic, Table, Tag, Tooltip, Typography } from "antd";
import type { TableColumnsType } from "antd";
import { ArrowLeftOutlined, CheckCircleOutlined, DeleteOutlined, EditOutlined, FileExcelOutlined, FilePdfOutlined, MailOutlined, ReloadOutlined, StopOutlined, WalletOutlined } from "@ant-design/icons";
import { PageTitle } from "@/components/app-shell";
import { usePdfViewer } from "@/components/pdf-viewer-context";
import { useCan } from "@/auth/use-auth";
import { useAction } from "@/features/sales/use-action";
import { idr, jakartaToday, useBankAccounts } from "./api";
import { exportExcel } from "./exports";
import {
  deletePayrollRun,
  dueDates,
  employeeBpjs,
  employerCost,
  payPayrollBpjs,
  periodLabel,
  postPayrollRun,
  refreshPayrollRun,
  sendPayslip,
  useEmployees,
  totals,
  updatePayrollLine,
  usePayrollRun,
  voidPayrollRun,
  type AnnualWorking,
  type PayrollLine,
  type PayrollRun,
} from "./payroll-api";

const dateLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** One month's payroll: review and adjust the draft, post it, pay BPJS, payslips and the PPh 21 list. */
export function PayrollRunPage() {
  const { id } = useParams();
  const can = useCan();
  const navigate = useNavigate();
  const viewPdf = usePdfViewer();
  const { data, isLoading, error } = usePayrollRun(id);
  const { run, busy } = useAction([["payroll-run", id ?? ""], ["payroll-runs"], ["finance-dashboard"]]);
  const [editing, setEditing] = useState<PayrollLine | null>(null);
  const [paying, setPaying] = useState<"salaries" | "bpjs" | null>(null);
  const [voiding, setVoiding] = useState(false);
  const [mailing, setMailing] = useState<PayrollLine[] | null>(null);

  if (!can("accounting.manage")) return <Result status="403" title="Finance only" />;
  if (isLoading) return <Skeleton active paragraph={{ rows: 12 }} />;
  if (error || !data) return <Result status="404" title="Payroll not found" extra={<Button onClick={() => navigate("/finance/payroll")}>Back to payroll</Button>} />;

  const { run: payroll, lines } = data;
  const draft = payroll.status === "draft";
  const posted = payroll.status === "posted";
  const sum = totals(lines);
  const due = dueDates(payroll.period);
  const month = periodLabel(payroll.period);

  const payslips = (only?: PayrollLine) =>
    viewPdf({
      title: only ? `Payslip · ${only.employee_name} · ${month}` : `Payslips · ${month}`,
      fileName: only ? `slip-gaji_${payroll.period.slice(0, 7)}_${only.employee_name.replace(/\W+/g, "-").toLowerCase()}.pdf` : `slip-gaji_${payroll.period.slice(0, 7)}.pdf`,
      note: draft ? "Draft — the numbers can still change until the payroll is posted." : undefined,
      make: async () => (await import("./payslip-pdf-file")).payslipPdf(payroll, only ? [only] : lines),
    });

  const ebupot = () =>
    run("ebupot", () =>
      exportExcel(`pph21_${due.masa}.xlsx`, `Masa ${due.masa}`, [
        {
          name: "PPh 21",
          title: "Daftar pemotongan PPh 21 pegawai (bahan e-Bupot 21/26, Coretax)",
          columns: [
            { header: "NIK / NPWP", key: "nik", width: 20 },
            { header: "Nama", key: "name", width: 28 },
            { header: "Status PTKP", key: "ptkp", width: 11 },
            { header: "Kode objek pajak", key: "code", width: 15 },
            { header: "Penghasilan bruto", key: "gross", kind: "money" },
            { header: "Metode", key: "method", width: 16 },
            { header: "Tarif TER (%)", key: "rate", kind: "number", width: 12 },
            { header: "PPh 21 dipotong", key: "pph21", kind: "money" },
          ],
          rows: lines.map((line) => ({
            nik: line.npwp || line.nik || "",
            name: line.employee_name,
            ptkp: line.ptkp_status,
            code: line.employment_type === "permanent" ? "21-100-01" : "21-100-03",
            gross: Number(line.gross),
            method: line.pph21_method === "ter" ? `TER kategori ${line.ter_category}` : line.pph21_method === "daily" ? "TER harian" : "Pasal 17 (setahun)",
            rate: line.ter_rate === null ? null : Number(line.ter_rate),
            pph21: Number(line.pph21),
          })),
          totals: { name: "JUMLAH", gross: lines.reduce((total, line) => total + Number(line.gross), 0), pph21: sum.pph21 },
        },
      ]),
    );

  const columns: TableColumnsType<PayrollLine> = [
    {
      title: "Employee",
      key: "name",
      fixed: "left",
      render: (_, line) => (
        <div>
          <Typography.Text strong>{line.employee_name}</Typography.Text>
          <div style={{ fontSize: 12, opacity: 0.65 }}>
            {line.ptkp_status} · {line.employment_type === "permanent" ? `TER ${line.ter_category}` : line.pay_basis === "daily" ? `by the day, ${line.days_worked ?? 0} days` : `non-permanent · TER ${line.ter_category}`}
            {line.position ? ` · ${line.position}` : ""}
          </div>
          {line.below_minimum ? <Tag color="warning" style={{ marginTop: 2 }}>Below minimum wage</Tag> : null}
          {line.pay_basis === "daily" && !line.days_worked ? <Tag color="warning" style={{ marginTop: 2 }}>Enter days worked</Tag> : null}
        </div>
      ),
    },
    {
      title: "Salary + allowance",
      key: "salary",
      align: "right",
      render: (_, line) => idr(Number(line.base_salary) + Number(line.allowance)),
    },
    {
      title: "Other income",
      key: "other",
      align: "right",
      render: (_, line) =>
        Number(line.other_income) ? (
          <Tooltip title={line.other_income_note ?? undefined}>
            <span>{idr(line.other_income)}</span>
          </Tooltip>
        ) : (
          "—"
        ),
    },
    { title: "Gross (for PPh 21)", key: "gross", align: "right", render: (_, line) => idr(line.gross) },
    {
      title: "PPh 21",
      key: "pph21",
      align: "right",
      render: (_, line) => (
        <div>
          {idr(line.pph21)}
          <div style={{ fontSize: 12, opacity: 0.65 }}>{line.pph21_method === "ter" ? `TER ${Number(line.ter_rate)}%` : line.pph21_method === "daily" ? `Daily ${Number(line.ter_rate)}%` : "Year-end (Art. 17)"}</div>
        </div>
      ),
    },
    { title: "BPJS (employee)", key: "bpjs_ee", align: "right", render: (_, line) => idr(employeeBpjs(line)) },
    { title: "Net pay", key: "net", align: "right", render: (_, line) => <Typography.Text strong>{idr(line.net_pay)}</Typography.Text> },
    { title: "BPJS (company)", key: "bpjs_er", align: "right", render: (_, line) => idr(employerCost(line)) },
    ...(posted
      ? [
          {
            title: "Payslip",
            key: "payslip",
            render: (_: unknown, line: PayrollLine) =>
              line.payslip_sent_at ? (
                <Tooltip title={`Sent to ${line.payslip_sent_to} on ${new Date(line.payslip_sent_at).toLocaleString("en-GB")}`}>
                  <Tag color="success">Emailed</Tag>
                </Tooltip>
              ) : line.payslip_error ? (
                <Tooltip title={line.payslip_error}>
                  <Tag color="error">Failed</Tag>
                </Tooltip>
              ) : (
                <Tag>Not sent</Tag>
              ),
          },
        ]
      : []),
    {
      title: <span className="sr-only">Actions</span>,
      key: "actions",
      width: 110,
      render: (_, line) => (
        <Flex gap={2}>
          {draft ? <Button size="small" type="text" icon={<EditOutlined />} aria-label={`Edit ${line.employee_name}`} onClick={() => setEditing(line)} /> : null}
          <Tooltip title="Payslip">
            <Button size="small" type="text" icon={<FilePdfOutlined />} aria-label={`Payslip for ${line.employee_name}`} onClick={() => payslips(line)} />
          </Tooltip>
          {posted ? (
            <Tooltip title="Email the payslip">
              <Button size="small" type="text" icon={<MailOutlined />} aria-label={`Email payslip to ${line.employee_name}`} onClick={() => setMailing([line])} />
            </Tooltip>
          ) : null}
        </Flex>
      ),
    },
  ];

  return (
    <>
      <PageTitle
        title={`Payroll · ${month}`}
        description={draft ? "Draft: check each line, add bonus, THR or overtime, then post. Posting books it and pays the net salaries." : posted ? `Posted; salaries paid ${payroll.paid_on ? dateLabel(payroll.paid_on) : ""}.` : `Void${payroll.void_reason ? ` — ${payroll.void_reason}` : ""}.`}
        actions={
          <Flex gap={8} wrap>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/finance/payroll")}>
              Payroll
            </Button>
            <Button icon={<FilePdfOutlined />} disabled={!lines.length} onClick={() => payslips()}>
              Payslips
            </Button>
            <Button icon={<FileExcelOutlined />} disabled={!lines.length} loading={busy === "ebupot"} onClick={ebupot}>
              PPh 21 list
            </Button>
            {draft ? (
              <>
                <Tooltip title="Add new employees, drop who left, and work it out again with the current rates.">
                  <Button icon={<ReloadOutlined />} loading={busy === "refresh"} onClick={() => run("refresh", () => refreshPayrollRun(payroll.id), "Payroll refreshed.")}>
                    Refresh
                  </Button>
                </Tooltip>
                <Popconfirm title="Delete this draft?" okText="Delete" okButtonProps={{ danger: true }} onConfirm={() => run("delete", async () => { await deletePayrollRun(payroll.id); navigate("/finance/payroll"); }, "Draft deleted.")}>
                  <Button danger icon={<DeleteOutlined />} loading={busy === "delete"}>
                    Delete
                  </Button>
                </Popconfirm>
                <Button type="primary" icon={<CheckCircleOutlined />} disabled={!lines.length} onClick={() => setPaying("salaries")}>
                  Post & pay
                </Button>
              </>
            ) : null}
            {posted ? (
              <>
                <Button icon={<MailOutlined />} disabled={!lines.length} onClick={() => setMailing(lines)}>
                  Email payslips
                </Button>
                {!payroll.bpjs_journal_entry_id ? (
                  <Button icon={<WalletOutlined />} onClick={() => setPaying("bpjs")}>
                    Pay BPJS
                  </Button>
                ) : null}
                <Button danger icon={<StopOutlined />} onClick={() => setVoiding(true)}>
                  Void
                </Button>
              </>
            ) : null}
          </Flex>
        }
      />
      <Flex vertical gap={16}>
        <Row gutter={[16, 16]}>
          <Col xs={12} lg={4}>
            <Card size="small"><Statistic title="Employees" value={sum.people} /></Card>
          </Col>
          <Col xs={12} lg={5}>
            <Card size="small"><Statistic title="Net pay (to employees)" value={idr(sum.net)} /></Card>
          </Col>
          <Col xs={12} lg={5}>
            <Card size="small"><Statistic title="PPh 21 withheld" value={idr(sum.pph21)} /></Card>
          </Col>
          <Col xs={12} lg={5}>
            <Card size="small"><Statistic title="BPJS (both shares)" value={idr(sum.bpjs)} /></Card>
          </Col>
          <Col xs={24} lg={5}>
            <Card size="small"><Statistic title="Cost to the company" value={idr(sum.cost)} /></Card>
          </Col>
        </Row>
        {posted ? (
          <Alert
            type="info"
            showIcon
            title={
              <span>
                Pay PPh 21 of {idr(sum.pph21)} by {dateLabel(due.pph21)} and report it in Coretax (e-Bupot 21/26) by the 20th — record the payment on the <Link to="/finance/tax">Tax page</Link> as PPh 21, masa {due.masa}.{" "}
                {payroll.bpjs_journal_entry_id ? `BPJS paid ${payroll.bpjs_paid_on ? dateLabel(payroll.bpjs_paid_on) : ""}.` : `Pay BPJS of ${idr(sum.bpjs)} by ${dateLabel(due.bpjs)}.`}
              </span>
            }
          />
        ) : null}
        <Card>
          <Table
            rowKey="id"
            size="middle"
            columns={columns}
            dataSource={lines}
            pagination={false}
            scroll={{ x: 1100 }}
            expandable={{ expandedRowRender: (line) => <LineDetail line={line} /> }}
            summary={() =>
              lines.length ? (
                <Table.Summary.Row style={{ fontWeight: 600 }}>
                  <Table.Summary.Cell index={0}>Total</Table.Summary.Cell>
                  <Table.Summary.Cell index={1} />
                  <Table.Summary.Cell index={2} align="right">{idr(lines.reduce((total, line) => total + Number(line.base_salary) + Number(line.allowance), 0))}</Table.Summary.Cell>
                  <Table.Summary.Cell index={3} align="right">{idr(lines.reduce((total, line) => total + Number(line.other_income), 0))}</Table.Summary.Cell>
                  <Table.Summary.Cell index={4} align="right">{idr(lines.reduce((total, line) => total + Number(line.gross), 0))}</Table.Summary.Cell>
                  <Table.Summary.Cell index={5} align="right">{idr(sum.pph21)}</Table.Summary.Cell>
                  <Table.Summary.Cell index={6} align="right">{idr(sum.bpjs - sum.employer)}</Table.Summary.Cell>
                  <Table.Summary.Cell index={7} align="right">{idr(sum.net)}</Table.Summary.Cell>
                  <Table.Summary.Cell index={8} align="right">{idr(sum.employer)}</Table.Summary.Cell>
                  {posted ? <Table.Summary.Cell index={9} /> : null}
                  <Table.Summary.Cell index={posted ? 10 : 9} />
                </Table.Summary.Row>
              ) : null
            }
          />
        </Card>
      </Flex>
      {editing ? <EditLine line={editing} busy={busy === "line"} onClose={() => setEditing(null)} onSave={(values) => run("line", () => updatePayrollLine(editing.id, values), "Line updated.").then((ok) => ok && setEditing(null))} /> : null}
      {paying ? (
        <PayModal
          kind={paying}
          amount={paying === "salaries" ? sum.net : sum.bpjs}
          defaultDate={jakartaToday()}
          busy={busy === "pay"}
          onClose={() => setPaying(null)}
          onPay={(date, bank) =>
            run("pay", () => (paying === "salaries" ? postPayrollRun(payroll.id, date, bank) : payPayrollBpjs(payroll.id, date, bank)), paying === "salaries" ? "Payroll posted." : "BPJS payment recorded.").then((ok) => ok && setPaying(null))
          }
        />
      ) : null}
      {mailing ? <MailModal run={payroll} lines={mailing} onClose={() => setMailing(null)} /> : null}
      {voiding ? <VoidModal busy={busy === "void"} onClose={() => setVoiding(false)} onVoid={(reason) => run("void", () => voidPayrollRun(payroll.id, reason), "Payroll voided; its entries are reversed.").then((ok) => ok && setVoiding(false))} /> : null}
    </>
  );
}

function LineDetail({ line }: { line: PayrollLine }) {
  const annual = line.annual as AnnualWorking | null;
  return (
    <Row gutter={[24, 12]}>
      <Col xs={24} md={12}>
        <Descriptions size="small" column={1} title="BPJS" bordered>
          <Descriptions.Item label="Kesehatan (company / employee)">{idr(line.kes_employer)} / {idr(line.kes_employee)}</Descriptions.Item>
          <Descriptions.Item label="JHT (company / employee)">{idr(line.jht_employer)} / {idr(line.jht_employee)}</Descriptions.Item>
          <Descriptions.Item label="JP (company / employee)">{idr(line.jp_employer)} / {idr(line.jp_employee)}</Descriptions.Item>
          <Descriptions.Item label="JKK / JKM (company)">{idr(line.jkk)} / {idr(line.jkm)}</Descriptions.Item>
        </Descriptions>
      </Col>
      <Col xs={24} md={12}>
        {annual ? (
          <Descriptions size="small" column={1} title={`PPh 21 for the year (${annual.months} months)`} bordered>
            <Descriptions.Item label="Gross for the year">{idr(annual.gross)}</Descriptions.Item>
            <Descriptions.Item label="“Biaya jabatan” (5%, max Rp500,000/month)">− {idr(annual.job_expense)}</Descriptions.Item>
            <Descriptions.Item label="JHT + JP paid by the employee">− {idr(annual.pension_fees)}</Descriptions.Item>
            <Descriptions.Item label={`PTKP (${line.ptkp_status})`}>− {idr(annual.ptkp)}</Descriptions.Item>
            <Descriptions.Item label="Taxable (rounded down)">{idr(annual.taxable)}</Descriptions.Item>
            <Descriptions.Item label="Tax for the year (Art. 17)">{idr(annual.tax)}</Descriptions.Item>
            <Descriptions.Item label="Withheld Jan – earlier months">− {idr(annual.withheld_before)}</Descriptions.Item>
            <Descriptions.Item label="This month">{idr(line.pph21)}{Number(line.pph21) < 0 ? " (returned to the employee)" : ""}</Descriptions.Item>
          </Descriptions>
        ) : (
          <Descriptions size="small" column={1} title="PPh 21 (TER)" bordered>
            <Descriptions.Item label="Gross: salary, allowance, other income + JKK, JKM, BPJS Kesehatan (company)">{idr(line.gross)}</Descriptions.Item>
            <Descriptions.Item label={`TER category ${line.ter_category} rate`}>{Number(line.ter_rate)}%</Descriptions.Item>
            <Descriptions.Item label="PPh 21">{idr(line.pph21)}</Descriptions.Item>
          </Descriptions>
        )}
      </Col>
    </Row>
  );
}

const rupiah = {
  min: 0,
  step: 100000,
  style: { width: "100%" },
  formatter: (value: number | string | undefined) => (value === undefined || value === "" ? "" : Number(value).toLocaleString("id-ID")),
  parser: (value: string | undefined) => Number((value ?? "").replace(/[^\d]/g, "")),
  addonBefore: "Rp",
};

type LineValues = { base_salary: number; daily_rate: number; days_worked: number; allowance: number; other_income: number; other_income_note: string };

function EditLine({ line, busy, onClose, onSave }: { line: PayrollLine; busy: boolean; onClose: () => void; onSave: (values: LineValues) => void }) {
  const [form] = Form.useForm<LineValues>();
  return (
    <Modal open title={`${line.employee_name} · this month`} okText="Save" confirmLoading={busy} onOk={() => form.submit()} onCancel={onClose} destroyOnHidden>
      <Form<LineValues>
        form={form}
        layout="vertical"
        initialValues={{ base_salary: Number(line.base_salary), daily_rate: Number(line.daily_rate ?? 0), days_worked: line.days_worked ?? 0, allowance: Number(line.allowance), other_income: Number(line.other_income), other_income_note: line.other_income_note ?? "" }}
        onFinish={onSave}
      >
        <Typography.Paragraph type="secondary">Only this month changes; the employee's usual salary stays as it is. PPh 21 and BPJS are worked out again on save.</Typography.Paragraph>
        {line.pay_basis === "daily" ? (
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label="Days worked" name="days_worked">
                <InputNumber min={0} max={31} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Day rate" name="daily_rate">
                <InputNumber {...rupiah} />
              </Form.Item>
            </Col>
          </Row>
        ) : (
          <Form.Item label="Base salary" name="base_salary" extra="E.g. pro-rated for someone who joined mid-month.">
            <InputNumber {...rupiah} />
          </Form.Item>
        )}
        <Form.Item label="Fixed allowance" name="allowance">
          <InputNumber {...rupiah} />
        </Form.Item>
        <Form.Item label="Other income" name="other_income" extra="Bonus, THR, overtime — taxed, not counted for BPJS.">
          <InputNumber {...rupiah} />
        </Form.Item>
        <Form.Item label="What the other income is" name="other_income_note">
          <Input maxLength={200} placeholder="e.g. THR Idul Fitri" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function PayModal({ kind, amount, defaultDate, busy, onClose, onPay }: { kind: "salaries" | "bpjs"; amount: number; defaultDate: string; busy: boolean; onClose: () => void; onPay: (date: string, bank: string) => void }) {
  const { data: banks } = useBankAccounts();
  const active = (banks ?? []).filter((bank) => bank.active && bank.currency === "IDR");
  const [date, setDate] = useState(defaultDate);
  const [bank, setBank] = useState<string | undefined>(undefined);
  const chosen = bank ?? active[0]?.id;
  return (
    <Modal
      open
      title={kind === "salaries" ? "Post the payroll and pay salaries" : "Pay BPJS"}
      okText={kind === "salaries" ? `Post & pay ${idr(amount)}` : `Pay ${idr(amount)}`}
      okButtonProps={{ disabled: !chosen || !date }}
      confirmLoading={busy}
      onOk={() => chosen && onPay(date, chosen)}
      onCancel={onClose}
      destroyOnHidden
    >
      <Typography.Paragraph type="secondary">
        {kind === "salaries"
          ? "Books salaries and the company's BPJS as expenses, the net salaries out of the bank, and PPh 21 and BPJS as owed until they are paid. A posted payroll can only be voided, not edited."
          : "Both shares — what the company pays and what was taken from salaries — to BPJS Kesehatan and BPJS Ketenagakerjaan."}
      </Typography.Paragraph>
      <Flex vertical gap={12}>
        <div>
          <Typography.Text>Paid on</Typography.Text>
          <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} style={{ display: "block", width: 200 }} />
        </div>
        <div>
          <Typography.Text>From</Typography.Text>
          <Select style={{ display: "block", width: "100%" }} value={chosen} onChange={setBank} options={active.map((item) => ({ value: item.id, label: `${item.name}${item.account_last4 ? ` ··${item.account_last4}` : ""}` }))} placeholder="Bank account" />
          {!active.length ? <Typography.Text type="warning">Add an IDR bank account in Finance settings first.</Typography.Text> : null}
        </div>
      </Flex>
    </Modal>
  );
}

function VoidModal({ busy, onClose, onVoid }: { busy: boolean; onClose: () => void; onVoid: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <Modal open title="Void this payroll?" okText="Void" okButtonProps={{ danger: true, disabled: !reason.trim() }} confirmLoading={busy} onOk={() => onVoid(reason.trim())} onCancel={onClose} destroyOnHidden>
      <Typography.Paragraph type="secondary">Its journal entries (and the BPJS payment, if recorded) are reversed today. Later months of the year must be voided first. Then start the month again.</Typography.Paragraph>
      <Input.TextArea rows={2} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} placeholder="Why, e.g. wrong salary for one employee" />
    </Modal>
  );
}

/** Email payslips: pick who gets one, then send them one by one with progress. */
function MailModal({ run, lines, onClose }: { run: PayrollRun; lines: PayrollLine[]; onClose: () => void }) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { data: employees, isLoading } = useEmployees();
  const emailOf = new Map((employees ?? []).map((employee) => [employee.id, employee.email?.trim() || null]));
  const sendable = lines.filter((line) => emailOf.get(line.employee_id));
  // Unsent ones are picked to start with (all of them when only one was asked for).
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const chosen = picked ?? new Set((lines.length === 1 ? sendable : sendable.filter((line) => !line.payslip_sent_at)).map((line) => line.id));
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<Record<string, "sent" | string>>({});
  const total = lines.filter((line) => chosen.has(line.id)).length;
  const finished = Object.keys(done).length;

  const send = async () => {
    setSending(true);
    let sent = 0;
    for (const line of lines.filter((item) => chosen.has(item.id))) {
      try {
        await sendPayslip(run, line);
        sent += 1;
        setDone((current) => ({ ...current, [line.id]: "sent" }));
      } catch (cause) {
        setDone((current) => ({ ...current, [line.id]: (cause as Error).message || "Not sent" }));
      }
    }
    setSending(false);
    await queryClient.invalidateQueries({ queryKey: ["payroll-run", run.id] });
    if (sent === total) message.success(sent === 1 ? "Payslip emailed." : `${sent} payslips emailed.`);
    else message.warning(`${sent} of ${total} sent; see the list for what failed.`);
  };

  const toggle = (id: string, on: boolean) => {
    const next = new Set(chosen);
    if (on) next.add(id);
    else next.delete(id);
    setPicked(next);
  };

  return (
    <Modal
      open
      title="Email payslips"
      okText={finished && !sending ? "Done" : `Send ${total || ""}`.trim()}
      okButtonProps={{ icon: <MailOutlined />, disabled: !total && !finished, loading: sending }}
      cancelButtonProps={{ disabled: sending }}
      onOk={() => (finished && !sending ? onClose() : send())}
      onCancel={() => !sending && onClose()}
      closable={!sending}
      width={620}
      destroyOnHidden
    >
      <Typography.Paragraph type="secondary">
        Each employee gets their own payslip as a PDF, sent to the email on their employee record. The email itself shows no amounts.
      </Typography.Paragraph>
      {isLoading ? <Skeleton active /> : null}
      <Flex vertical gap={6}>
        {lines.map((line) => {
          const email = emailOf.get(line.employee_id);
          const result = done[line.id];
          return (
            <Flex key={line.id} justify="space-between" align="center" gap={8} style={{ padding: "4px 0" }}>
              <Checkbox checked={chosen.has(line.id)} disabled={!email || sending || Boolean(result)} onChange={(event) => toggle(line.id, event.target.checked)}>
                <span>{line.employee_name}</span>
                <Typography.Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                  {email ?? "no email on record"}
                </Typography.Text>
              </Checkbox>
              {result === "sent" ? (
                <Tag color="success">Sent</Tag>
              ) : result ? (
                <Tooltip title={result}>
                  <Tag color="error">Failed</Tag>
                </Tooltip>
              ) : line.payslip_sent_at ? (
                <Tag>Sent before</Tag>
              ) : null}
            </Flex>
          );
        })}
      </Flex>
      {sending || finished ? <Progress percent={total ? Math.round((finished / total) * 100) : 0} size="small" style={{ marginTop: 12 }} /> : null}
      {lines.some((line) => !emailOf.get(line.employee_id)) && !isLoading ? (
        <Alert type="info" showIcon style={{ marginTop: 12 }} title="Add an email to the employee (Payroll → Employees) to send theirs." />
      ) : null}
    </Modal>
  );
}
