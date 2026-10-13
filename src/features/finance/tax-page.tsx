import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Card, Col, Descriptions, Empty, Flex, Input, InputNumber, Modal, Row, Select, Skeleton, Table, Tag, Typography } from "antd";
import { FileExcelOutlined, PlusOutlined } from "@ant-design/icons";
import { PageTitle } from "@/components/app-shell";
import { supabase } from "@/lib/supabase";
import { useAction } from "@/features/sales/use-action";
import { TAX_TYPES, WITHHELD, WITHHOLDING, idr, jakartaToday, money, recordTaxPayment, useBankAccounts } from "./api";
import { exportExcel } from "./exports";
import { PpnCard } from "./ppn-card";
import { DateInput } from "@/components/date-input";

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
  withheld: Withheld[];
  withheld_due: { pph21: number; pph21_payroll: number; pph23: number; pph42: number; pph26: number };
};
type Withheld = {
  id: string;
  number: string;
  spent_on: string;
  vendor: string;
  vendor_kind: string;
  vendor_id: string | null;
  country: string | null;
  type: string;
  code: string;
  code_name: string;
  base_idr: number;
  rate: number;
  amount_idr: number;
  reference: string | null;
  treaty: boolean;
  bupot_number: string | null;
  bupot_date: string | null;
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
  const [paying, setPaying] = useState<{ type?: string; amount?: number } | null>(null);
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
        description="Each tax month (“masa pajak”): what is due, what was paid, and the lists for Coretax and your accountant."
        actions={
          <Flex gap={8}>
            <Select value={masa} onChange={setMasa} style={{ width: 180 }} options={months.map((value) => ({ value, label: masaLabel(value) }))} />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setPaying({})}>
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
            title="Tax withheld by customers (“bukti potong” received)"
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

          <WithheldCard report={data} onPay={(type, amount) => setPaying({ type, amount })} />

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
      {paying ? (
        <TaxPaymentModal
          masa={masa}
          initialType={paying.type}
          suggested={paying.amount ?? Math.max(due - paidTotal, 0)}
          regime={data?.regime ?? "general"}
          onClose={() => setPaying(null)}
        />
      ) : null}
    </>
  );
}

function TaxPaymentModal({ masa, initialType, suggested, regime, onClose }: { masa: string; initialType?: string; suggested: number; regime: string; onClose: () => void }) {
  const { run, busy } = useAction([["tax-report"], ["finance-dashboard"]]);
  const { data: banks } = useBankAccounts();
  const active = (banks ?? []).filter((bank) => bank.active);
  const [type, setType] = useState(initialType ?? (regime === "pp55" ? "pph_final" : "pph25"));
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
        <DateInput value={paidOn} max={jakartaToday()} onChange={(value) => setPaidOn(value)} />
        <Select value={bank?.id} onChange={setBankId} options={active.map((item) => ({ value: item.id, label: `${item.name} (${item.currency})` }))} placeholder="Paid from" />
        <Input value={billing} onChange={(event) => setBilling(event.target.value)} placeholder="Kode billing" maxLength={40} />
        <Input value={ntpn} onChange={(event) => setNtpn(event.target.value)} placeholder="NTPN (from the payment receipt)" maxLength={40} />
      </Flex>
    </Modal>
  );
}

/** What QUBIQ withheld this masa (from vendors, freelancers and salaries): to pay by the 15th and report by the 20th, with the bukti potong to make in Coretax. */
function WithheldCard({ report, onPay }: { report: Report; onPay: (type: string, amount: number) => void }) {
  const due = report.withheld_due;
  const paidOf = (type: string) => report.paid.filter((row) => row.type === type).reduce((sum, row) => sum + Number(row.amount), 0);
  const kinds = [
    { type: "pph21", label: "PPh 21", note: Number(due.pph21_payroll) ? `salaries ${idr(due.pph21_payroll)}, freelancers ${idr(Number(due.pph21) - Number(due.pph21_payroll))}` : "freelancers and experts", amount: Number(due.pph21), form: "e-Bupot 21/26" },
    { type: "pph23", label: "PPh 23", note: "Indonesian businesses", amount: Number(due.pph23), form: "e-Bupot Unifikasi" },
    { type: "pph42", label: "PPh 4(2) final", note: "rent, construction", amount: Number(due.pph42), form: "e-Bupot Unifikasi" },
    { type: "pph26", label: "PPh 26", note: "vendors abroad", amount: Number(due.pph26), form: "e-Bupot Unifikasi" },
  ].filter((kind) => kind.amount > 0);
  const unified = report.withheld.filter((row) => row.type !== "pph21");
  const freelancers = report.withheld.filter((row) => row.type === "pph21");
  const missing = report.withheld.filter((row) => !row.bupot_number).length;

  const exportLists = () =>
    exportExcel(`pemotongan-${report.masa}.xlsx`, `Masa ${report.masa}`, [
      {
        name: "Bupot Unifikasi",
        title: "PPh 23, PPh 4(2) dan PPh 26 yang dipotong (bahan e-Bupot Unifikasi, Coretax)",
        columns: [
          { header: "Tanggal", key: "spent_on", kind: "date" }, { header: "Pengeluaran", key: "number", width: 14 }, { header: "Penerima penghasilan", key: "vendor", width: 28 },
          { header: "NPWP / NIK / TIN", key: "vendor_id", width: 20 }, { header: "Negara", key: "country", width: 14 }, { header: "Jenis PPh", key: "kind", width: 12 },
          { header: "Kode objek pajak", key: "code", width: 12 }, { header: "Objek", key: "code_name", width: 40 }, { header: "DPP (Rp)", key: "base_idr", kind: "money" },
          { header: "Tarif (%)", key: "rate", kind: "number", width: 9 }, { header: "PPh dipotong (Rp)", key: "amount_idr", kind: "money" }, { header: "Dokumen dasar", key: "reference", width: 20 },
          { header: "P3B / SKD", key: "treaty_text", width: 9 }, { header: "No. bukti potong", key: "bupot_number", width: 22 },
        ],
        rows: unified.map((row) => ({ ...row, kind: WITHHELD[row.type] ?? row.type, treaty_text: row.treaty ? "ya" : "" })),
        totals: { vendor: "JUMLAH", base_idr: unified.reduce((sum, row) => sum + Number(row.base_idr), 0), amount_idr: unified.reduce((sum, row) => sum + Number(row.amount_idr), 0) },
      },
      {
        name: "PPh 21 bukan pegawai",
        title: "PPh 21 atas bukan pegawai (bahan e-Bupot 21/26, Coretax)",
        columns: [
          { header: "Tanggal", key: "spent_on", kind: "date" }, { header: "Pengeluaran", key: "number", width: 14 }, { header: "Nama", key: "vendor", width: 28 },
          { header: "NIK / NPWP", key: "vendor_id", width: 20 }, { header: "Kode objek pajak", key: "code", width: 12 }, { header: "Penghasilan bruto (Rp)", key: "base_idr", kind: "money" },
          { header: "DPP 50% (Rp)", key: "half", kind: "money" }, { header: "Tarif efektif (%)", key: "rate", kind: "number", width: 11 }, { header: "PPh 21 dipotong (Rp)", key: "amount_idr", kind: "money" },
          { header: "No. bukti potong", key: "bupot_number", width: 22 },
        ],
        rows: freelancers.map((row) => ({ ...row, half: Math.floor(Number(row.base_idr) / 2) })),
        totals: { vendor: "JUMLAH", base_idr: freelancers.reduce((sum, row) => sum + Number(row.base_idr), 0), amount_idr: freelancers.reduce((sum, row) => sum + Number(row.amount_idr), 0) },
      },
    ]);

  return (
    <Card
      title="Tax we withheld (pay by the 15th, report by the 20th)"
      extra={
        <Button size="small" icon={<FileExcelOutlined />} disabled={!report.withheld.length} onClick={exportLists}>
          Lists for Coretax
        </Button>
      }
    >
      {kinds.length === 0 ? (
        <Typography.Text type="secondary">Nothing withheld this month.</Typography.Text>
      ) : (
        <Flex vertical gap={12}>
          <Row gutter={[12, 12]}>
            {kinds.map((kind) => {
              const paid = paidOf(kind.type);
              const left = Math.max(kind.amount - paid, 0);
              return (
                <Col key={kind.type} xs={24} sm={12} lg={6}>
                  <Card size="small">
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {kind.label} · {kind.note}
                    </Typography.Text>
                    <div style={{ fontSize: 18, fontWeight: 600 }}>{idr(kind.amount)}</div>
                    <Flex justify="space-between" align="center" gap={6} style={{ marginTop: 4 }}>
                      <Tag color={left === 0 ? "success" : "warning"}>{left === 0 ? "Paid" : `${idr(left)} to pay`}</Tag>
                      {left > 0 ? (
                        <Button size="small" type="link" onClick={() => onPay(kind.type, left)} style={{ paddingInline: 0 }}>
                          Record payment
                        </Button>
                      ) : null}
                    </Flex>
                    <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                      Report in {kind.form}
                    </Typography.Text>
                  </Card>
                </Col>
              );
            })}
          </Row>
          {report.withheld.length ? (
            <>
              {missing ? <Alert type="warning" showIcon title={`${missing} “bukti potong” not recorded yet — make them in Coretax and note the numbers on Money out.`} /> : null}
              <Table
                size="small"
                rowKey="id"
                pagination={false}
                dataSource={report.withheld}
                scroll={{ x: 760 }}
                columns={[
                  { title: "Vendor", key: "vendor", render: (_, row) => <Flex vertical><span>{row.vendor}</span><Typography.Text type="secondary" style={{ fontSize: 12 }}>{row.number} · {dateLabel(row.spent_on)}</Typography.Text></Flex> },
                  { title: "Tax", key: "tax", render: (_, row) => <Flex vertical><span>{WITHHELD[row.type] ?? row.type} · {row.code}</span><Typography.Text type="secondary" style={{ fontSize: 12 }}>{Number(row.rate)}%{row.treaty ? " (treaty)" : ""} of {idr(row.base_idr)}</Typography.Text></Flex> },
                  { title: "Bukti potong", key: "bp", render: (_, row) => row.bupot_number ?? <Typography.Text type="warning">Not recorded</Typography.Text> },
                  { title: "Withheld", key: "amount", align: "right", render: (_, row) => idr(row.amount_idr) },
                ]}
              />
            </>
          ) : null}
        </Flex>
      )}
    </Card>
  );
}
