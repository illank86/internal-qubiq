import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Card, Col, Flex, Form, Input, InputNumber, Popconfirm, Result, Row, Segmented, Select, Skeleton, Table, Tag, Typography, theme } from "antd";
import { CheckCircleOutlined, DeleteOutlined, FileExcelOutlined, FilePdfOutlined, PlusOutlined, RollbackOutlined } from "@ant-design/icons";
import { PageTitle } from "@/components/app-shell";
import { usePdfViewer } from "@/components/pdf-viewer-context";
import { useCan } from "@/auth/use-auth";
import { supabase } from "@/lib/supabase";
import { useAction } from "@/features/sales/use-action";
import { idr, jakartaToday } from "./api";
import { exportExcel } from "./exports";
import { loadNominativeLists } from "./nominative";
import { worksheetRows, type Worksheet } from "./annual-tax";

const call = async <T,>(name: string, args: Record<string, unknown>) => {
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) throw error;
  return data as T;
};

/**
 * The annual corporate tax return (SPT Tahunan PPh Badan, 1771) worksheet:
 * from the year's books to taxable income, the tax with Article 31E, the
 * credits, PPh 29 and next year's PPh 25. Filed in Coretax; this is the working.
 */
export function AnnualTaxPage() {
  const can = useCan();
  const viewPdf = usePdfViewer();
  const { token } = theme.useToken();
  const thisYear = Number(jakartaToday().slice(0, 4));
  const [year, setYear] = useState(thisYear - 1);
  const allowed = can("accounting.manage");
  const { run, busy } = useAction([["annual-tax", String(year)], ["finance-dashboard"], ["accounting-settings"]]);
  const { data: w, isLoading, error } = useQuery({ queryKey: ["annual-tax", String(year)], enabled: allowed, queryFn: () => call<Worksheet>("annual_tax_worksheet", { p_year: year }) });
  const [adding, setAdding] = useState<{ kind: "positive" | "negative"; description: string; amount: number | null }>({ kind: "positive", description: "", amount: null });
  const [settings] = Form.useForm<{ loss: number; other: number; note: string }>();
  if (!allowed) return <Result status="403" title="Finance only" />;

  const ended = year < thisYear;
  const addAdjustment = () =>
    run("adj", async () => {
      const { error: insertError } = await supabase.from("fiscal_adjustments").insert({ year, kind: adding.kind, description: adding.description.trim(), amount: adding.amount ?? 0 });
      if (insertError) throw insertError;
      setAdding({ kind: adding.kind, description: "", amount: null });
    }, "Correction added.");
  const removeAdjustment = (id: string) =>
    run(`del:${id}`, async () => {
      const { error: deleteError } = await supabase.from("fiscal_adjustments").delete().eq("id", id);
      if (deleteError) throw deleteError;
    }, "Correction removed.");

  const excel = async () => {
    if (!w) return;
    const lists = await loadNominativeLists(w.year);
    const nominee = (kind: "entertainment" | "other") => lists.nominees.filter((row) => (kind === "entertainment") === (row.kind === "entertainment"));
    exportExcel(`spt-badan_${w.year}.xlsx`, `Tahun pajak ${w.year}`, [
      {
        name: "Rekonsiliasi fiskal",
        title: `Rekonsiliasi fiskal dan penghitungan PPh badan ${w.year} (bahan SPT 1771)`,
        columns: [
          { header: "Uraian", key: "label", width: 60 },
          { header: "Jumlah (Rp)", key: "amount", kind: "money" },
        ],
        rows: worksheetRows(w).map((row) => ({ label: row.label, amount: row.amount })),
      },
      {
        name: "Nominatif promosi & natura",
        title: `Daftar nominatif biaya promosi dan natura/kenikmatan ${w.year} (Lampiran 11A-I)`,
        columns: [
          { header: "Tanggal", key: "given_on", kind: "date" }, { header: "Nama", key: "name", width: 28 }, { header: "NPWP / NIK", key: "tax_id", width: 20 },
          { header: "Alamat", key: "address", width: 32 }, { header: "Bentuk dan jenis biaya", key: "description", width: 28 },
          { header: "Jumlah (Rp)", key: "amount", kind: "money" }, { header: "PPh dipotong (Rp)", key: "tax_withheld", kind: "money" },
          { header: "Jenis", key: "kind_text", width: 12 }, { header: "Pengeluaran", key: "expense", width: 14 }, { header: "Keterangan", key: "note", width: 24 },
        ],
        rows: nominee("other").map((row) => ({ ...row, kind_text: row.kind === "benefit" ? "Natura" : "Promosi" })),
        totals: { amount: nominee("other").reduce((sum, row) => sum + row.amount, 0), tax_withheld: nominee("other").reduce((sum, row) => sum + row.tax_withheld, 0) },
      },
      {
        name: "Nominatif jamuan",
        title: `Daftar nominatif biaya entertainment / jamuan ${w.year} (Lampiran 11A-II)`,
        columns: [
          { header: "Tanggal", key: "given_on", kind: "date" }, { header: "Tempat", key: "place", width: 26 }, { header: "Jenis", key: "description", width: 22 },
          { header: "Jumlah (Rp)", key: "amount", kind: "money" }, { header: "Nama relasi", key: "name", width: 26 }, { header: "Posisi", key: "job_title", width: 18 },
          { header: "Nama perusahaan", key: "company", width: 26 }, { header: "Jenis usaha", key: "business_type", width: 18 }, { header: "Pengeluaran", key: "expense", width: 14 },
        ],
        rows: nominee("entertainment"),
        totals: { amount: nominee("entertainment").reduce((sum, row) => sum + row.amount, 0) },
      },
      {
        name: "Tanpa daftar nominatif",
        title: `Biaya promosi, jamuan dan natura ${w.year} tanpa daftar nominatif (dikoreksi fiskal)`,
        columns: [
          { header: "Tanggal", key: "spent_on", kind: "date" }, { header: "Pengeluaran", key: "number", width: 14 }, { header: "Penerima / vendor", key: "vendor_name", width: 30 },
          { header: "Keterangan", key: "description", width: 34 }, { header: "Jenis", key: "kind_text", width: 14 }, { header: "Jumlah (Rp)", key: "amount", kind: "money" },
        ],
        rows: lists.missing,
        totals: { amount: lists.missing.reduce((sum, row) => sum + row.amount, 0) },
      },
    ]);
  };
  const pdf = () =>
    w &&
    viewPdf({
      title: `“SPT Tahunan PPh Badan ${w.year}” — worksheet`,
      fileName: `spt-badan_${w.year}.pdf`,
      note: "The working for the return filed in Coretax.",
      make: async () => (await import("./annual-tax-file")).annualTaxPdf(w),
    });

  return (
    <>
      <PageTitle
        title="Annual tax return"
        description="“SPT Tahunan PPh Badan”: from the year's books to the tax, PPh 29 to pay by 30 April, and next year's PPh 25. Filed in Coretax; this is the working."
        actions={
          <Flex gap={8} wrap>
            <Select value={year} onChange={setYear} style={{ width: 110 }} options={[thisYear, thisYear - 1, thisYear - 2, thisYear - 3].map((value) => ({ value, label: String(value) }))} />
            <Button icon={<FileExcelOutlined />} disabled={!w} onClick={excel}>
              Excel
            </Button>
            <Button type="primary" icon={<FilePdfOutlined />} disabled={!w} onClick={pdf}>
              View PDF
            </Button>
          </Flex>
        }
      />
      {error ? <Alert type="error" showIcon title="The worksheet could not be loaded." style={{ marginBottom: 16 }} /> : null}
      {isLoading || !w ? (
        <Skeleton active paragraph={{ rows: 12 }} />
      ) : (
        <Flex vertical gap={16}>
          {!ended ? <Alert type="info" showIcon title={`${year} has not ended: these are the figures so far.`} /> : null}
          {w.regime === "pp55" ? <Alert type="warning" showIcon title="This year is under PP 55 (0.5% final on revenue, paid monthly): there is no corporate tax on profit to work out here." /> : null}
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={14}>
              <Card title="From the books to taxable income">
                <Table
                  size="small"
                  pagination={false}
                  rowKey="key"
                  showHeader={false}
                  dataSource={worksheetRows(w).filter((row) => row.section === "fiscal")}
                  columns={[
                    { key: "label", render: (_, row) => <span style={{ fontWeight: row.strong ? 600 : 400, paddingLeft: row.indent ? 16 : 0 }}>{row.label}</span> },
                    { key: "amount", align: "right", render: (_, row) => <span style={{ fontWeight: row.strong ? 600 : 400, fontVariantNumeric: "tabular-nums" }}>{idr(row.amount)}</span> },
                  ]}
                />
              </Card>
            </Col>
            <Col xs={24} lg={10}>
              <Card title="Tax">
                <AmountLine label="Taxable income (PKP)" value={idr(w.taxable)} />
                <AmountLine label="Gross revenue (for 31E)" value={idr(w.gross_revenue)} />
                <AmountLine
                  label="Rate"
                  value={
                    w.regime === "pp55"
                      ? "PP 55 (final)"
                      : w.facility_share === 1
                        ? `${Number(w.corporate_rate)}% × 50% (Art. 31E, revenue ≤ Rp4.8bn)`
                        : w.facility_share && w.facility_share > 0
                          ? `${Number(w.corporate_rate)}%, with 50% on ${(w.facility_share * 100).toFixed(1)}% of PKP (Art. 31E)`
                          : `${Number(w.corporate_rate)}%`
                  }
                />
                <AmountLine label="“PPh badan” for the year" value={idr(w.tax)} strong />
                <AmountLine label="Less PPh 23 withheld by customers" value={idr(w.credits.pph23)} less />
                <AmountLine label="Less PPh 25 paid" value={idr(w.credits.pph25)} less />
                <AmountLine label="Less PPh 22 / 24" value={idr(w.credits.other)} less last />
                <Flex justify="space-between" gap={12} style={{ padding: "10px 12px", marginTop: 12, borderRadius: token.borderRadius, background: token.colorPrimaryBg, fontWeight: 700 }}>
                  <span>{w.pph29 >= 0 ? "PPh 29 to pay" : "Overpaid (“lebih bayar”)"}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{idr(Math.abs(w.pph29))}</span>
                </Flex>
                <Typography.Text type="secondary" style={{ display: "block", fontSize: 12, marginTop: 6 }}>
                  Pay PPh 29 before filing; file by {w.due}. Record the payment on the Tax page as PPh 29, tax year {w.year}.
                </Typography.Text>
              </Card>
            </Col>
          </Row>

          <Row gutter={[16, 16]}>
            <Col xs={24} lg={14}>
              <Card title="Fiscal corrections entered by hand">
                <Typography.Paragraph type="secondary" style={{ marginTop: -4 }}>
                  Non-deductible accounts and expenses are added automatically. Add what else the tax rules require: positive (e.g. benefits in kind not taxed to employees, costs without a nominee list) or negative (other income already taxed finally). Bank interest recorded in Money in is taken out automatically.
                </Typography.Paragraph>
                <Table
                  size="small"
                  rowKey="id"
                  pagination={false}
                  dataSource={w.adjustments}
                  locale={{ emptyText: "None." }}
                  columns={[
                    { title: "", key: "kind", width: 90, render: (_, row) => <Tag color={row.kind === "positive" ? "orange" : "blue"}>{row.kind === "positive" ? "Positive" : "Negative"}</Tag> },
                    { title: "", dataIndex: "description", key: "description" },
                    { title: "", key: "amount", align: "right", render: (_, row) => idr(row.amount) },
                    { title: "", key: "del", width: 40, render: (_, row) => <Button size="small" type="text" danger icon={<DeleteOutlined />} loading={busy === `del:${row.id}`} onClick={() => removeAdjustment(row.id)} aria-label="Remove" /> },
                  ]}
                />
                <Flex gap={8} wrap style={{ marginTop: 12 }}>
                  <Segmented<"positive" | "negative"> value={adding.kind} onChange={(kind) => setAdding({ ...adding, kind })} options={[{ value: "positive", label: "Positive" }, { value: "negative", label: "Negative" }]} />
                  <Input value={adding.description} onChange={(event) => setAdding({ ...adding, description: event.target.value })} placeholder="What it is" maxLength={200} style={{ flex: "1 1 200px" }} />
                  <InputNumber<number> value={adding.amount} onChange={(amount) => setAdding({ ...adding, amount })} min={1} placeholder="Rp" style={{ width: 160 }}
                    formatter={(value) => (value ? Number(value).toLocaleString("id-ID") : "")} parser={(value) => Number((value ?? "").replace(/[^\d]/g, ""))} />
                  <Button icon={<PlusOutlined />} disabled={adding.description.trim().length < 2 || !adding.amount} loading={busy === "adj"} onClick={addAdjustment}>
                    Add
                  </Button>
                </Flex>
              </Card>
            </Col>
            <Col xs={24} lg={10}>
              <Card title="Losses, other credits, next year">
                <Form
                  form={settings}
                  layout="vertical"
                  key={`${w.year}-${w.loss_carryforward}-${w.credits.other}`}
                  initialValues={{ loss: Number(w.loss_carryforward), other: Number(w.credits.other), note: w.note ?? "" }}
                  onFinish={(values) => run("settings", () => call("set_annual_return", { p_year: year, p_loss: values.loss ?? 0, p_other_credits: values.other ?? 0, p_note: values.note ?? "" }), "Saved.")}
                >
                  <Form.Item label="Losses brought forward (“kompensasi kerugian”)" name="loss" extra="Fiscal losses of the previous 5 years not yet used.">
                    <InputNumber<number> min={0} style={{ width: "100%" }} formatter={(value) => (value ? Number(value).toLocaleString("id-ID") : "")} parser={(value) => Number((value ?? "").replace(/[^\d]/g, ""))} />
                  </Form.Item>
                  <Form.Item label="PPh 22 / PPh 24 credits" name="other" extra="Tax paid on imports or abroad that counts against this year's tax.">
                    <InputNumber<number> min={0} style={{ width: "100%" }} formatter={(value) => (value ? Number(value).toLocaleString("id-ID") : "")} parser={(value) => Number((value ?? "").replace(/[^\d]/g, ""))} />
                  </Form.Item>
                  <Form.Item label="Notes" name="note">
                    <Input.TextArea autoSize={{ minRows: 2 }} maxLength={1000} />
                  </Form.Item>
                  <Button htmlType="submit" loading={busy === "settings"}>
                    Save
                  </Button>
                </Form>
                <div style={{ marginTop: 16, marginBottom: 12 }}>
                  <AmountLine label="PPh 25 for next year (a month)" value={idr(w.next_pph25)} strong />
                  <AmountLine label="Set now (a month)" value={idr(w.current_pph25)} last />
                </div>
                <Button size="small" disabled={Number(w.next_pph25) === Number(w.current_pph25)} loading={busy === "pph25"} onClick={() => run("pph25", () => call("apply_next_pph25", { p_year: year }), "Monthly PPh 25 updated.")}>
                  Use as the monthly PPh 25
                </Button>
                {w.net_fiscal < 0 ? <Alert type="info" showIcon style={{ marginTop: 12 }} title={`A fiscal loss of ${idr(-w.net_fiscal)}: carry it forward to the next 5 years.`} /> : null}
              </Card>
            </Col>
          </Row>

          <Card size="small">
            <Flex justify="space-between" align="center" gap={8} wrap>
              <Typography.Text>
                {w.posted
                  ? `The year's tax is booked (31 December ${w.year}): “PPh badan” expense, credits used, and PPh 29 owed.`
                  : "When the figures are final, book the year's tax on 31 December so the balance sheet shows PPh 29 owed (or overpaid)."}
              </Typography.Text>
              {w.posted ? (
                <Popconfirm title="Reverse the year-end tax entry?" onConfirm={() => run("undo", () => call("undo_annual_tax", { p_year: year }), "Year-end tax entry reversed.")}>
                  <Button icon={<RollbackOutlined />} loading={busy === "undo"}>
                    Undo
                  </Button>
                </Popconfirm>
              ) : (
                <Popconfirm title={`Book “PPh badan” ${idr(w.tax)} on 31 December ${w.year}?`} disabled={!ended} onConfirm={() => run("post", () => call("post_annual_tax", { p_year: year }), "Year-end tax booked.")}>
                  <Button type="primary" icon={<CheckCircleOutlined />} disabled={!ended} loading={busy === "post"}>
                    Book the year's tax
                  </Button>
                </Popconfirm>
              )}
            </Flex>
          </Card>
        </Flex>
      )}
    </>
  );
}

/** A label and its amount on one line, the amount right-aligned so the column of figures lines up. */
function AmountLine({ label, value, strong, less, last }: { label: string; value: string; strong?: boolean; less?: boolean; last?: boolean }) {
  const { token } = theme.useToken();
  return (
    <Flex
      justify="space-between"
      align="baseline"
      gap={16}
      style={{ padding: "7px 0", borderBottom: last ? undefined : `1px solid ${token.colorBorderSecondary}`, fontWeight: strong ? 600 : undefined }}
    >
      <Typography.Text type={less ? "secondary" : undefined} style={{ fontWeight: "inherit" }}>
        {label}
      </Typography.Text>
      <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: /^-?(IDR|Rp)/.test(value) || less ? "nowrap" : undefined }}>
        {less ? <Typography.Text type="secondary">− </Typography.Text> : null}
        {value}
      </span>
    </Flex>
  );
}
