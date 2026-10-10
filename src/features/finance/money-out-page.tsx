import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, App, Button, Checkbox, Col, Drawer, Flex, Form, Input, InputNumber, Modal, Row, Segmented, Select, Table, Tag, Tooltip, Typography, Upload } from "antd";
import type { TableColumnsType } from "antd";
import { CheckCircleOutlined, EyeOutlined, FileExcelOutlined, PaperClipOutlined, PlusOutlined, StopOutlined } from "@ant-design/icons";
import { PageTitle } from "@/components/app-shell";
import { usePdfViewer } from "@/components/pdf-viewer-context";
import { formatInvoiceDate } from "@/lib/invoices";
import { errorText } from "@/lib/sales";
import { supabase } from "@/lib/supabase";
import { useAction } from "@/features/sales/use-action";
import {
  accountingFileBlob,
  jakartaToday,
  money,
  payExpense,
  recordExpense,
  uploadAccountingFile,
  useAccountingSettings,
  useAccounts,
  useBankAccounts,
  vendorFolder,
  voidExpense,
  type Expense,
} from "./api";
import { exportExcel } from "./exports";

type Row = Expense & { account: { code: string; name: string } | null };
type Filter = "all" | "unpaid" | "paid";
const CURRENCIES = ["IDR", "USD", "SGD", "EUR"];

/** Money out: what the company spends — paid now, or owed and paid later — with the receipt kept. */
export function MoneyOutPage() {
  const viewPdf = usePdfViewer();
  const { run, busy } = useAction([["expenses"], ["finance-dashboard"]]);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [paying, setPaying] = useState<Row | null>(null);
  const [voiding, setVoiding] = useState<Row | null>(null);
  const [reason, setReason] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["expenses"],
    queryFn: async () => {
      const { data: rows, error: loadError } = await supabase.from("expenses").select("*, account:accounts(code, name)").order("spent_on", { ascending: false }).order("created_at", { ascending: false }).limit(2000);
      if (loadError) throw loadError;
      return (rows ?? []) as unknown as Row[];
    },
  });
  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data ?? []).filter(
      (row) =>
        (filter === "all" || (row.status === filter && !row.voided_at)) &&
        (!query || [row.number, row.vendor_name, row.description, row.account?.name].some((value) => (value ?? "").toLowerCase().includes(query))),
    );
  }, [data, filter, search]);
  const owed = (data ?? []).filter((row) => row.status === "unpaid" && !row.voided_at);

  const columns: TableColumnsType<Row> = [
    {
      title: "Expense",
      key: "number",
      render: (_, row) => (
        <Flex vertical>
          <Typography.Text style={{ fontFamily: "Geist Mono, monospace", fontSize: 13 }} delete={Boolean(row.voided_at)}>
            {row.number}
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {formatInvoiceDate(row.spent_on)}
          </Typography.Text>
        </Flex>
      ),
    },
    {
      title: "Vendor",
      key: "vendor",
      render: (_, row) => (
        <Flex vertical>
          <span>{row.vendor_name}</span>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {row.description}
          </Typography.Text>
        </Flex>
      ),
    },
    {
      title: "For",
      key: "account",
      responsive: ["md"],
      render: (_, row) => (
        <Flex vertical>
          <span>{row.account?.name}</span>
          {!row.deductible ? (
            <Typography.Text type="warning" style={{ fontSize: 12 }}>
              Not deductible
            </Typography.Text>
          ) : null}
        </Flex>
      ),
    },
    { title: "Amount", key: "amount", align: "right", render: (_, row) => <Typography.Text strong>{money(row.amount, row.currency)}</Typography.Text> },
    {
      title: "Status",
      key: "status",
      render: (_, row) =>
        row.voided_at ? (
          <Tooltip title={row.void_reason ?? undefined}>
            <Tag>Voided</Tag>
          </Tooltip>
        ) : row.status === "paid" ? (
          <Tag color="success">Paid {row.paid_on ? formatInvoiceDate(row.paid_on) : ""}</Tag>
        ) : (
          <Tag color="warning">Owed</Tag>
        ),
    },
    {
      title: <span className="sr-only">Actions</span>,
      key: "actions",
      align: "right",
      render: (_, row) => (
        <Flex gap={4} justify="flex-end">
          {row.attachment_path ? (
            <Button size="small" type="text" icon={<EyeOutlined />} aria-label="View receipt"
              onClick={() => viewPdf({ title: `Receipt · ${row.number}`, fileName: row.attachment_name || `${row.number}.pdf`, make: () => accountingFileBlob(row.attachment_path!) })} />
          ) : (
            <Tooltip title="No receipt attached">
              <PaperClipOutlined style={{ color: "var(--ant-color-warning)", padding: "0 6px" }} />
            </Tooltip>
          )}
          {!row.voided_at && row.status === "unpaid" ? (
            <Button size="small" icon={<CheckCircleOutlined />} onClick={() => setPaying(row)}>
              Pay
            </Button>
          ) : null}
          {!row.voided_at ? <Button size="small" type="text" danger icon={<StopOutlined />} aria-label={`Void ${row.number}`} onClick={() => setVoiding(row)} loading={busy === `void:${row.id}`} /> : null}
        </Flex>
      ),
    },
  ];

  const exportXlsx = () =>
    exportExcel("pengeluaran.xlsx", "Semua pengeluaran", [{
      name: "Pengeluaran",
      title: "Daftar pengeluaran",
      columns: [
        { header: "Nomor", key: "number", width: 14 }, { header: "Tanggal", key: "spent_on", kind: "date" }, { header: "Pemasok", key: "vendor_name", width: 28 },
        { header: "NPWP", key: "vendor_npwp", width: 20 }, { header: "Akun", key: "account_name", width: 30 }, { header: "Keterangan", key: "description", width: 30 },
        { header: "Mata uang", key: "currency", width: 9 }, { header: "Jumlah", key: "amount", kind: "money" }, { header: "PPN Masukan", key: "ppn_in_amount", kind: "money" },
        { header: "No. faktur", key: "faktur_number", width: 22 }, { header: "Dapat dibiayakan", key: "deductible_text", width: 12 }, { header: "Status", key: "status_text", width: 10 },
        { header: "Tgl bayar", key: "paid_on", kind: "date" }, { header: "Batal", key: "voided", width: 8 },
      ],
      rows: rows.map((row) => ({ ...row, account_name: row.account ? `${row.account.code} ${row.account.name}` : "", deductible_text: row.deductible ? "ya" : "tidak",
        status_text: row.status === "paid" ? "lunas" : "terutang", voided: row.voided_at ? "ya" : "" })),
    }]);

  return (
    <>
      <PageTitle
        title="Money out"
        description={`What the company spends: paid now, or owed and paid later. ${owed.length ? `${owed.length} still owed.` : ""}`}
        actions={
          <Flex gap={8}>
            <Button icon={<FileExcelOutlined />} onClick={exportXlsx}>
              Excel
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setAdding(true)}>
              Add expense
            </Button>
          </Flex>
        }
      />
      {error ? <Alert type="error" showIcon title="Expenses could not be loaded." style={{ marginBottom: 16 }} /> : null}
      <Flex wrap gap={12} justify="space-between" style={{ marginBottom: 16 }}>
        <Segmented<Filter> value={filter} onChange={setFilter} options={[{ value: "all", label: "All" }, { value: "unpaid", label: "Owed" }, { value: "paid", label: "Paid" }]} />
        <Input.Search allowClear value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Expense, vendor, description" style={{ maxWidth: 320 }} />
      </Flex>
      <Table<Row> rowKey="id" loading={isLoading} columns={columns} dataSource={rows} pagination={{ pageSize: 25, hideOnSinglePage: true }} scroll={{ x: 880 }} locale={{ emptyText: "No expenses yet." }} />
      <ExpenseDrawer open={adding} onClose={() => setAdding(false)} />
      {paying ? <PayModal expense={paying} onClose={() => setPaying(null)} run={run} /> : null}
      <Modal
        open={Boolean(voiding)}
        onCancel={() => setVoiding(null)}
        title={`Void ${voiding?.number ?? "expense"}?`}
        okText="Void expense"
        okButtonProps={{ danger: true, disabled: !reason.trim() }}
        onOk={() =>
          voiding &&
          run(`void:${voiding.id}`, () => voidExpense(voiding.id, reason.trim()), "Expense voided.").then((ok) => {
            if (ok) {
              setVoiding(null);
              setReason("");
            }
          })
        }
        destroyOnHidden
      >
        <Typography.Paragraph type="secondary">Its bookings (and payment, if paid) are reversed and kept in the journal.</Typography.Paragraph>
        <Input.TextArea rows={2} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why, e.g. entered twice" maxLength={300} />
      </Modal>
    </>
  );
}

type Values = {
  spent_on: string;
  vendor_name: string;
  vendor_npwp: string;
  account_id: string;
  description: string;
  currency: string;
  amount: number;
  deductible: boolean;
  paid: "paid" | "unpaid";
  bank_account_id: string;
  idr_paid: number | null;
  ppn_in_amount: number | null;
  faktur_number: string;
};

function ExpenseDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form] = Form.useForm<Values>();
  const { message } = App.useApp();
  const { run } = useAction([["expenses"], ["finance-dashboard"]]);
  const { data: accounts } = useAccounts();
  const { data: banks } = useBankAccounts();
  const { data: settings } = useAccountingSettings();
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paid = Form.useWatch("paid", form) ?? "paid";
  const currency = Form.useWatch("currency", form) ?? "IDR";
  const bankId = Form.useWatch("bank_account_id", form);
  const bank = (banks ?? []).find((item) => item.id === bankId);
  const expenseAccounts = (accounts ?? []).filter((account) => account.active && account.type === "expense" && !account.role?.startsWith("tax_") && account.role !== "fx_loss" && account.role !== "write_off");

  const save = async (values: Values) => {
    setPending(true);
    setError(null);
    try {
      const stored = file ? await uploadAccountingFile(vendorFolder(values.vendor_name), "receipt", file) : null;
      const ok = await run(
        "expense",
        () =>
          recordExpense({
            spent_on: values.spent_on,
            vendor_name: values.vendor_name,
            vendor_npwp: values.vendor_npwp,
            account_id: values.account_id,
            description: values.description,
            currency: values.currency,
            amount: values.amount,
            deductible: values.deductible,
            paid: values.paid === "paid",
            bank_account_id: values.bank_account_id,
            idr_paid: values.currency !== "IDR" && bank?.currency === "IDR" ? values.idr_paid : null,
            ppn_in_amount: values.ppn_in_amount,
            faktur_number: values.faktur_number,
            attachment_path: stored?.path,
            attachment_name: stored?.name,
          }),
        values.paid === "paid" ? "Expense recorded and paid." : "Expense recorded as owed.",
      );
      if (ok) {
        form.resetFields();
        setFile(null);
        onClose();
      }
    } catch (cause) {
      setError(errorText(cause as { code?: string; message?: string }, "The expense could not be saved."));
    } finally {
      setPending(false);
    }
    void message;
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Add expense"
      size={620}
      destroyOnHidden
      extra={
        <Button type="primary" loading={pending} onClick={() => form.submit()}>
          Save expense
        </Button>
      }
    >
      <Form<Values>
        form={form}
        layout="vertical"
        requiredMark="optional"
        onFinish={save}
        disabled={pending}
        initialValues={{ spent_on: jakartaToday(), currency: "IDR", deductible: true, paid: "paid", bank_account_id: (banks ?? []).find((item) => item.active)?.id }}
        onValuesChange={(changed) => {
          if ("account_id" in changed) {
            const account = (accounts ?? []).find((item) => item.id === changed.account_id);
            if (account) form.setFieldValue("deductible", account.deductible);
          }
        }}
      >
        <Row gutter={12}>
          <Col xs={24} sm={10}>
            <Form.Item label="Date" name="spent_on" rules={[{ required: true }]}>
              <Input type="date" max={jakartaToday()} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={14}>
            <Form.Item label="What it is for" name="account_id" rules={[{ required: true, message: "Choose a category" }]}>
              <Select showSearch optionFilterProp="label" options={expenseAccounts.map((account) => ({ value: account.id, label: `${account.code} ${account.name}` }))} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={14}>
            <Form.Item label="Vendor" name="vendor_name" rules={[{ required: true, whitespace: true }, { max: 200 }]}>
              <Input placeholder="e.g. Amazon Web Services" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={10}>
            <Form.Item label="Vendor NPWP" name="vendor_npwp" rules={[{ pattern: /^[0-9.\-\s]{15,22}$/, message: "15–16 digits" }]}>
              <Input placeholder="Optional" />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item label="Description" name="description" rules={[{ required: true, whitespace: true }, { max: 300 }]}>
              <Input placeholder="e.g. Hosting, October" />
            </Form.Item>
          </Col>
          <Col xs={8} sm={6}>
            <Form.Item label="Currency" name="currency">
              <Select options={CURRENCIES.map((value) => ({ value }))} />
            </Form.Item>
          </Col>
          <Col xs={16} sm={10}>
            <Form.Item label="Amount" name="amount" rules={[{ required: true, type: "number", min: 0.01, message: "The amount" }]}>
              <InputNumber min={0} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8}>
            <Form.Item label=" " name="deductible" valuePropName="checked" extra="Untick for costs the tax office does not accept (gifts, private use…).">
              <Checkbox>Deductible</Checkbox>
            </Form.Item>
          </Col>
        </Row>
        {settings?.pkp ? (
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item label="PPN Masukan in that amount" name="ppn_in_amount">
                <InputNumber min={0} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item label="Faktur pajak number" name="faktur_number" rules={[{ max: 40 }]} extra="Input VAT only counts with the vendor's faktur.">
                <Input />
              </Form.Item>
            </Col>
          </Row>
        ) : null}
        <Form.Item name="paid" label="Paid?">
          <Segmented options={[{ value: "paid", label: "Paid now" }, { value: "unpaid", label: "Owed, pay later" }]} />
        </Form.Item>
        {paid === "paid" ? (
          <Row gutter={12}>
            <Col xs={24} sm={14}>
              <Form.Item label="From bank account" name="bank_account_id" rules={[{ required: true, message: "Choose the bank account" }]}>
                <Select options={(banks ?? []).filter((item) => item.active).map((item) => ({ value: item.id, label: `${item.name} (${item.currency})` }))} />
              </Form.Item>
            </Col>
            {currency !== "IDR" && bank?.currency === "IDR" ? (
              <Col xs={24} sm={10}>
                <Form.Item label="Rupiah actually paid" name="idr_paid" extra="From the bank statement; the difference is booked as exchange gain/loss.">
                  <InputNumber min={0} suffix="IDR" style={{ width: "100%" }} />
                </Form.Item>
              </Col>
            ) : null}
          </Row>
        ) : null}
        <Form.Item label="Receipt or invoice">
          <Upload accept="application/pdf,image/jpeg,image/png" maxCount={1} beforeUpload={(chosen) => { setFile(chosen); return false; }} onRemove={() => setFile(null)}
            fileList={file ? [{ uid: "receipt", name: file.name, status: "done" }] : []}>
            <Button icon={<PaperClipOutlined />}>Attach</Button>
          </Upload>
        </Form.Item>
        {error ? <Alert type="error" showIcon title={error} /> : null}
      </Form>
    </Drawer>
  );
}

function PayModal({ expense, onClose, run }: { expense: Row; onClose: () => void; run: ReturnType<typeof useAction>["run"] }) {
  const { data: banks } = useBankAccounts();
  const active = (banks ?? []).filter((bank) => bank.active);
  const [bankId, setBankId] = useState<string | undefined>(active[0]?.id);
  const [paidOn, setPaidOn] = useState(jakartaToday());
  const [idrPaid, setIdrPaid] = useState<number | null>(null);
  const bank = active.find((item) => item.id === (bankId ?? active[0]?.id));
  return (
    <Modal
      open
      onCancel={onClose}
      title={`Pay ${expense.number}`}
      okText="Record payment"
      okButtonProps={{ disabled: !bank }}
      onOk={() => bank && run(`pay:${expense.id}`, () => payExpense(expense.id, paidOn, bank.id, idrPaid), "Expense paid.").then((ok) => ok && onClose())}
      destroyOnHidden
    >
      <Flex vertical gap={12}>
        <Typography.Text>
          {expense.vendor_name}: {money(expense.amount, expense.currency)}
        </Typography.Text>
        <Input type="date" value={paidOn} max={jakartaToday()} onChange={(event) => setPaidOn(event.target.value)} />
        <Select value={bank?.id} onChange={setBankId} options={active.map((item) => ({ value: item.id, label: `${item.name} (${item.currency})` }))} placeholder="Bank account" />
        {expense.currency !== "IDR" && bank?.currency === "IDR" ? (
          <InputNumber value={idrPaid} onChange={(value) => setIdrPaid(value === null ? null : Number(value))} min={0} suffix="IDR" style={{ width: "100%" }} placeholder="Rupiah actually paid" />
        ) : null}
      </Flex>
    </Modal>
  );
}
