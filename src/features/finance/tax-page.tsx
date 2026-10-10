import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Card, Col, Descriptions, Empty, Flex, Input, InputNumber, Modal, Row, Select, Skeleton, Table, Tag, Typography } from "antd";
import { FileExcelOutlined, PlusOutlined } from "@ant-design/icons";
import { PageTitle } from "@/components/app-shell";
import { supabase } from "@/lib/supabase";
import { useAction } from "@/features/sales/use-action";
import { TAX_TYPES, WITHHOLDING, idr, jakartaToday, money, recordTaxPayment, useBankAccounts } from "./api";
import { exportExcel } from "./exports";
import { PpnCard } from "./ppn-card";

type Report = {
  masa: string;
  regime: "general" | "pp55";
  pkp: boolean;
  revenue: number;
  expenses: number;
  pp55_due: number | null;
  pph25_due: number | null;
  due_date: string;
  report_date: string;
  paid: { type: string; amount: number; paid_on: string; ntpn: string | null; billing_code: string | null }[];
  withholdings: { receipt: string; received_on: string; invoice: string | null; customer: string | null; type: string; amount: number; currency: string; amount_idr: number; bukti_potong_number: string | null; bukti_potong_date: string | null }[];
  receipts: { number: string; received_on: string; invoice: string | null; customer: string | null; currency: string; net_received: number; settled: number; reference: string | null }[];
  expenses_list: { number: string; spent_on: string; vendor: string; vendor_npwp: string | null; account: string; currency: string; amount: number; deductible: boolean; faktur_number: string | null }[];
};

/** The last 18 tax months, newest first (YYYY-MM, Jakarta time). */
function recentMonths() {
  const [year, month] = jakartaToday().split("-").map(Number);
  return Array.from({ length: 18 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 - index, 1));
    return date.toISOString().slice(0, 7);
  });
}

const masaLabel = (masa: string) => new Date(`${masa}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
const dateLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** A tax month (masa pajak): what is due, what was paid, the bukti potong received, and the lists to hand to Coretax or the accountant. */
export function TaxPage() {
  const months = recentMonths();
  // Default: last month — the one whose tax is due now.
  const [masa, setMasa] = useState(months[1]);
  const [paying, setPaying] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ["tax-report", masa],
    queryFn: async () => {
      const { data: result, error: loadError } = await supabase.rpc("monthly_tax_report", { p_masa: masa });
      if (loadError) throw loadError;
      return result as unknown as Report;
    },
  });
  const paidTotal = (data?.paid ?? []).reduce((sum, row) => sum + Number(row.amount), 0);
  const due = data ? (data.regime === "pp55" ? Number(data.pp55_due ?? 0) : Number(data.pph25_due ?? 0)) : 0;

  return (
    <>
      <PageTitle
        title="Tax"
        description="Each tax month (masa pajak): what is due, what was paid, and the lists for Coretax and your accountant."
        actions={
          <Flex gap={8}>
            <Select value={masa} onChange={setMasa} style={{ width: 180 }} options={months.map((value) => ({ value, label: masaLabel(value) }))} />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setPaying(true)}>
              Record tax payment
            </Button>
          </Flex>
        }
      />
      {error ? <Alert type="error" showIcon title="The tax month could not be loaded." style={{ marginBottom: 16 }} /> : null}
      {isLoading || !data ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : (
        <Flex vertical gap={16}>
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={14}>
              <Card title={`Masa ${masaLabel(data.masa)}`} style={{ height: "100%" }}>
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="Revenue (peredaran bruto)">{idr(data.revenue)}</Descriptions.Item>
                  <Descriptions.Item label="Costs">{idr(data.expenses)}</Descriptions.Item>
                  {data.regime === "pp55" ? (
                    <Descriptions.Item label="PPh final 0.5% to pay">{idr(data.pp55_due)} (after what customers already withheld)</Descriptions.Item>
                  ) : (
                    <Descriptions.Item label="PPh 25 instalment">{idr(data.pph25_due)} {Number(data.pph25_due) === 0 ? "(0 until the first annual return sets it)" : ""}</Descriptions.Item>
                  )}
                  <Descriptions.Item label="Pay by">{dateLabel(data.due_date)}</Descriptions.Item>
                  <Descriptions.Item label="Report by">{dateLabel(data.report_date)}</Descriptions.Item>
                  <Descriptions.Item label="PPN">{data.pkp ? "PKP: PPN return by the end of next month (Phase 2 adds the PPN recap)." : "Not PKP: no PPN return."}</Descriptions.Item>
                </Descriptions>
              </Card>
            </Col>
            <Col xs={24} lg={10}>
              <Card title="Paid for this month" style={{ height: "100%" }}>
                {data.paid.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={due > 0 ? `Nothing paid yet — ${idr(due)} due.` : "Nothing paid (none due)."} />
                ) : (
                  <Flex vertical gap={8}>
                    {data.paid.map((row, index) => (
                      <Flex key={index} justify="space-between" gap={8}>
                        <div>
                          <Typography.Text>{TAX_TYPES[row.type] ?? row.type}</Typography.Text>
                          <Typography.Text type="secondary" style={{ display: "block", fontSize: 12 }}>
                            {dateLabel(row.paid_on)}
                            {row.ntpn ? ` · NTPN ${row.ntpn}` : ""}
                          </Typography.Text>
                        </div>
                        <Typography.Text strong>{idr(row.amount)}</Typography.Text>
                      </Flex>
                    ))}
                    <Tag color={paidTotal >= due ? "success" : "warning"} style={{ alignSelf: "flex-start" }}>
                      {paidTotal >= due ? "Paid" : `${idr(due - paidTotal)} still due`}
                    </Tag>
                  </Flex>
                )}
              </Card>
            </Col>
          </Row>

          <Card
            title="Tax withheld by customers (bukti potong received)"
            extra={
              <Button size="small" icon={<FileExcelOutlined />} disabled={!data.withholdings.length}
                onClick={() => exportExcel(`bukti-potong-${data.masa}.xlsx`, masaLabel(data.masa), [{
                  name: "Bukti Potong",
                  title: "Daftar PPh yang dipotong pelanggan",
                  columns: [
                    { header: "Penerimaan", key: "receipt", width: 14 }, { header: "Tanggal", key: "received_on", kind: "date" }, { header: "Invoice", key: "invoice", width: 16 },
                    { header: "Pemotong", key: "customer", width: 30 }, { header: "Jenis", key: "kind", width: 22 }, { header: "Jumlah (Rp)", key: "amount_idr", kind: "money" },
                    { header: "No. bukti potong", key: "bukti_potong_number", width: 22 }, { header: "Tgl bukti potong", key: "bukti_potong_date", kind: "date" },
                  ],
                  rows: data.withholdings.map((row) => ({ ...row, kind: WITHHOLDING[row.type] ?? row.type })),
                  totals: { customer: "Jumlah", amount_idr: data.withholdings.reduce((sum, row) => sum + Number(row.amount_idr), 0) },
                }])}>
                Excel
              </Button>
            }
          >
            <Typography.Paragraph type="secondary" style={{ marginTop: -4 }}>
              Your tax credits for the annual return. Check each one appears in Coretax under your NPWP.
            </Typography.Paragraph>
            <Table
              size="small"
              rowKey="receipt"
              pagination={false}
              dataSource={data.withholdings}
              locale={{ emptyText: "None this month." }}
              columns={[
                { title: "Customer", key: "customer", render: (_, row) => row.customer ?? "—" },
                { title: "Type", key: "type", render: (_, row) => WITHHOLDING[row.type] ?? row.type },
                { title: "Bukti potong", key: "bp", render: (_, row) => row.bukti_potong_number ?? <Typography.Text type="warning">Missing — ask the customer</Typography.Text> },
                { title: "Amount", key: "amount", align: "right", render: (_, row) => money(row.amount, row.currency) },
              ]}
            />
          </Card>

          <PpnCard masa={data.masa} period={masaLabel(data.masa)} />

          <Flex gap={8} wrap>
            <Button icon={<FileExcelOutlined />}
              onClick={() => exportExcel(`penerimaan-pengeluaran-${data.masa}.xlsx`, masaLabel(data.masa), [
                {
                  name: "Penerimaan",
                  title: "Daftar penerimaan",
                  columns: [
                    { header: "Nomor", key: "number", width: 14 }, { header: "Tanggal", key: "received_on", kind: "date" }, { header: "Invoice", key: "invoice", width: 16 },
                    { header: "Pelanggan", key: "customer", width: 30 }, { header: "Mata uang", key: "currency", width: 9 }, { header: "Diterima di bank", key: "net_received", kind: "money" },
                    { header: "Melunasi", key: "settled", kind: "money" }, { header: "Referensi", key: "reference", width: 22 },
                  ],
                  rows: data.receipts,
                },
                {
                  name: "Pengeluaran",
                  title: "Daftar pengeluaran",
                  columns: [
                    { header: "Nomor", key: "number", width: 14 }, { header: "Tanggal", key: "spent_on", kind: "date" }, { header: "Pemasok", key: "vendor", width: 28 },
                    { header: "NPWP", key: "vendor_npwp", width: 20 }, { header: "Akun", key: "account", width: 30 }, { header: "Mata uang", key: "currency", width: 9 },
                    { header: "Jumlah", key: "amount", kind: "money" }, { header: "Dapat dibiayakan", key: "deductible_text", width: 12 }, { header: "No. faktur", key: "faktur_number", width: 22 },
                  ],
                  rows: data.expenses_list.map((row) => ({ ...row, deductible_text: row.deductible ? "ya" : "tidak" })),
                },
              ])}>
              Payments and expenses — Excel
            </Button>
          </Flex>
        </Flex>
      )}
      {paying ? <TaxPaymentModal masa={masa} suggested={Math.max(due - paidTotal, 0)} regime={data?.regime ?? "general"} onClose={() => setPaying(false)} /> : null}
    </>
  );
}

function TaxPaymentModal({ masa, suggested, regime, onClose }: { masa: string; suggested: number; regime: string; onClose: () => void }) {
  const { run, busy } = useAction([["tax-report"], ["finance-dashboard"]]);
  const { data: banks } = useBankAccounts();
  const active = (banks ?? []).filter((bank) => bank.active);
  const [type, setType] = useState(regime === "pp55" ? "pph_final" : "pph25");
  const [period, setPeriod] = useState(masa);
  const [amount, setAmount] = useState<number | null>(suggested || null);
  const [paidOn, setPaidOn] = useState(jakartaToday());
  const [bankId, setBankId] = useState<string | undefined>();
  const [billing, setBilling] = useState("");
  const [ntpn, setNtpn] = useState("");
  const bank = active.find((item) => item.id === (bankId ?? active[0]?.id));
  return (
    <Modal
      open
      onCancel={onClose}
      title="Record tax payment"
      okText="Record"
      okButtonProps={{ disabled: !bank || !amount, loading: busy === "tax" }}
      onOk={() =>
        bank &&
        run("tax", () => recordTaxPayment({ tax_type: type, masa: type === "pph29" ? period.slice(0, 4) : period, amount, paid_on: paidOn, bank_account_id: bank.id, billing_code: billing, ntpn }), "Tax payment recorded.").then(
          (ok) => ok && onClose(),
        )
      }
      destroyOnHidden
    >
      <Flex vertical gap={10}>
        <Select value={type} onChange={setType} options={Object.entries(TAX_TYPES).map(([value, label]) => ({ value, label }))} />
        <Input value={period} onChange={(event) => setPeriod(event.target.value)} addonBefore={type === "pph29" ? "Tax year" : "Masa"} placeholder="YYYY-MM" />
        <InputNumber value={amount} onChange={(value) => setAmount(value === null ? null : Number(value))} min={0} suffix="IDR" style={{ width: "100%" }} placeholder="Amount" />
        <Input type="date" value={paidOn} max={jakartaToday()} onChange={(event) => setPaidOn(event.target.value)} />
        <Select value={bank?.id} onChange={setBankId} options={active.map((item) => ({ value: item.id, label: `${item.name} (${item.currency})` }))} placeholder="Paid from" />
        <Input value={billing} onChange={(event) => setBilling(event.target.value)} placeholder="Kode billing" maxLength={40} />
        <Input value={ntpn} onChange={(event) => setNtpn(event.target.value)} placeholder="NTPN (from the payment receipt)" maxLength={40} />
      </Flex>
    </Modal>
  );
}
