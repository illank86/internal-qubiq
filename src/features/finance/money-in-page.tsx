import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Flex, Input, Modal, Select, Table, Tag, Tooltip, Typography } from "antd";
import type { TableColumnsType } from "antd";
import { DownloadOutlined, EyeOutlined, PlusOutlined, StopOutlined } from "@ant-design/icons";
import { PageTitle } from "@/components/app-shell";
import { usePdfViewer } from "@/components/pdf-viewer-context";
import { formatInvoiceDate } from "@/lib/invoices";
import { supabase } from "@/lib/supabase";
import { useAction } from "@/features/sales/use-action";
import { WITHHOLDING, accountingFileBlob, downloadCsv, money, voidReceipt, type Receipt } from "./api";
import { RecordPaymentModal, type PaymentInvoice } from "./record-payment-modal";

type Row = Receipt & {
  invoice: { number: string | null; bill_to_name: string; bill_to_company: string | null } | null;
  bank: { name: string; currency: string } | null;
};
type OpenInvoice = PaymentInvoice & { bill_to_name: string; bill_to_company: string | null; status: string };

/** Money in: every payment received — what arrived, what the customer withheld (bukti potong), charges and differences. */
export function MoneyInPage() {
  const viewPdf = usePdfViewer();
  const { run, busy } = useAction([["receipts"], ["invoices"], ["finance-dashboard"], ["sales-money"]]);
  const [search, setSearch] = useState("");
  const [paying, setPaying] = useState<PaymentInvoice | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [voiding, setVoiding] = useState<Row | null>(null);
  const [reason, setReason] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["receipts"],
    queryFn: async () => {
      const { data: rows, error: loadError } = await supabase
        .from("receipts")
        .select("*, invoice:invoices(number, bill_to_name, bill_to_company), bank:bank_accounts(name, currency)")
        .order("received_on", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1000);
      if (loadError) throw loadError;
      return (rows ?? []) as unknown as Row[];
    },
  });
  // Invoices that can take a payment: approved, not void, something still open.
  const { data: openInvoices } = useQuery({
    queryKey: ["receipts", "open-invoices"],
    queryFn: async () => {
      const [{ data: invoices }, { data: settled }] = await Promise.all([
        supabase.from("invoices").select("id, number, currency, total, subtotal, discount_amount, issue_date, bill_to_name, bill_to_company, status").eq("approval_status", "approved").neq("status", "void"),
        supabase.from("receipts").select("invoice_id, settled").is("voided_at", null),
      ]);
      const paid = new Map<string, number>();
      for (const row of settled ?? []) if (row.invoice_id) paid.set(row.invoice_id, (paid.get(row.invoice_id) ?? 0) + Number(row.settled));
      return ((invoices ?? []) as OpenInvoice[]).filter((invoice) => Number(invoice.total) - (paid.get(invoice.id) ?? 0) > 0.005);
    },
  });

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data ?? []).filter((row) => !query || [row.number, row.invoice?.number, row.invoice?.bill_to_company, row.invoice?.bill_to_name, row.reference, row.bukti_potong_number].some((value) => (value ?? "").toLowerCase().includes(query)));
  }, [data, search]);

  const columns: TableColumnsType<Row> = [
    {
      title: "Payment",
      key: "number",
      render: (_, row) => (
        <Flex vertical>
          <Typography.Text style={{ fontFamily: "Geist Mono, monospace", fontSize: 13 }} delete={Boolean(row.voided_at)}>
            {row.number}
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {formatInvoiceDate(row.received_on)}
          </Typography.Text>
        </Flex>
      ),
    },
    {
      title: "From",
      key: "from",
      render: (_, row) => (
        <Flex vertical>
          <span>{row.invoice ? row.invoice.bill_to_company || row.invoice.bill_to_name : "Other income"}</span>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {row.invoice?.number ?? ""}
            {row.reference ? ` · ${row.reference}` : ""}
          </Typography.Text>
        </Flex>
      ),
    },
    { title: "Into", key: "bank", responsive: ["lg"], render: (_, row) => row.bank?.name ?? "—" },
    { title: "Arrived", key: "net", align: "right", render: (_, row) => money(row.net_received, row.currency) },
    {
      title: "Withheld",
      key: "wht",
      align: "right",
      responsive: ["md"],
      render: (_, row) =>
        Number(row.withholding_amount) > 0 ? (
          <Tooltip title={`${WITHHOLDING[row.withholding_type ?? "other"]}${row.bukti_potong_number ? ` · bukti potong ${row.bukti_potong_number}` : " · no bukti potong yet"}`}>
            <Typography.Text type={row.bukti_potong_number ? undefined : "warning"}>{money(row.withholding_amount, row.currency)}</Typography.Text>
          </Tooltip>
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        ),
    },
    {
      title: "Charges / other",
      key: "other",
      align: "right",
      responsive: ["lg"],
      render: (_, row) => {
        const other = Number(row.bank_charges) + Number(row.other_difference);
        return other > 0 ? <Tooltip title={row.difference_reason ?? undefined}>{money(other, row.currency)}</Tooltip> : <Typography.Text type="secondary">—</Typography.Text>;
      },
    },
    { title: "Settled", key: "settled", align: "right", render: (_, row) => <Typography.Text strong>{money(row.settled, row.currency)}</Typography.Text> },
    {
      title: <span className="sr-only">Actions</span>,
      key: "actions",
      align: "right",
      render: (_, row) => (
        <Flex gap={4} justify="flex-end">
          {row.voided_at ? (
            <Tooltip title={row.void_reason ?? undefined}>
              <Tag>Voided</Tag>
            </Tooltip>
          ) : null}
          {row.bukti_potong_path ? (
            <Button
              size="small"
              type="text"
              icon={<EyeOutlined />}
              aria-label="View bukti potong"
              onClick={() => viewPdf({ title: `Bukti potong · ${row.number}`, fileName: `${row.number}-bukti-potong.pdf`, make: () => accountingFileBlob(row.bukti_potong_path!) })}
            />
          ) : null}
          {!row.voided_at ? (
            <Button size="small" type="text" danger icon={<StopOutlined />} aria-label={`Void ${row.number}`} onClick={() => setVoiding(row)} loading={busy === `void:${row.id}`} />
          ) : null}
        </Flex>
      ),
    },
  ];

  const exportCsv = () =>
    downloadCsv(
      "penerimaan.csv",
      ["Nomor", "Tanggal", "Faktur/Invoice", "Pelanggan", "Mata uang", "Diterima di bank", "PPh dipotong", "Jenis PPh", "No. bukti potong", "Tgl bukti potong", "Biaya bank", "Selisih lain", "Melunasi", "Referensi", "Batal"],
      rows.map((row) => [
        row.number, row.received_on, row.invoice?.number, row.invoice?.bill_to_company || row.invoice?.bill_to_name, row.currency, row.net_received, row.withholding_amount,
        row.withholding_type, row.bukti_potong_number, row.bukti_potong_date, row.bank_charges, row.other_difference, row.settled, row.reference, row.voided_at ? "ya" : "",
      ]),
    );

  return (
    <>
      <PageTitle
        title="Money in"
        description="Payments received: what reached the bank, tax the customer withheld (bukti potong), bank charges and differences."
        actions={
          <Flex gap={8}>
            <Button icon={<DownloadOutlined />} onClick={exportCsv}>
              Export
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setChoosing(true)}>
              Record payment
            </Button>
          </Flex>
        }
      />
      {error ? <Alert type="error" showIcon title="Payments could not be loaded." style={{ marginBottom: 16 }} /> : null}
      <Flex justify="flex-end" style={{ marginBottom: 16 }}>
        <Input.Search allowClear value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Payment, invoice, customer, reference" style={{ maxWidth: 340 }} />
      </Flex>
      <Table<Row> rowKey="id" loading={isLoading} columns={columns} dataSource={rows} pagination={{ pageSize: 25, hideOnSinglePage: true }} scroll={{ x: 900 }} locale={{ emptyText: "No payments recorded yet." }} />

      <Modal open={choosing} onCancel={() => setChoosing(false)} title="Record payment for…" footer={null} destroyOnHidden>
        <Select
          showSearch
          autoFocus
          style={{ width: "100%" }}
          placeholder="Choose the invoice"
          optionFilterProp="label"
          options={(openInvoices ?? []).map((invoice) => ({
            value: invoice.id,
            label: `${invoice.number} · ${invoice.bill_to_company || invoice.bill_to_name} · ${money(invoice.total, invoice.currency)}${invoice.status === "paid" ? " (marked paid, no payment recorded)" : ""}`,
          }))}
          onChange={(id) => {
            setPaying((openInvoices ?? []).find((invoice) => invoice.id === id) ?? null);
            setChoosing(false);
          }}
          notFoundContent="No approved invoices are waiting for payment."
        />
      </Modal>
      {paying ? <RecordPaymentModal key={paying.id} invoice={paying} open onClose={() => setPaying(null)} /> : null}
      <Modal
        open={Boolean(voiding)}
        onCancel={() => setVoiding(null)}
        title={`Void ${voiding?.number ?? "payment"}?`}
        okText="Void payment"
        okButtonProps={{ danger: true, disabled: !reason.trim() }}
        onOk={() =>
          voiding &&
          run(`void:${voiding.id}`, () => voidReceipt(voiding.id, reason.trim()), "Payment voided; its invoice is open again.").then((ok) => {
            if (ok) {
              setVoiding(null);
              setReason("");
            }
          })
        }
        destroyOnHidden
      >
        <Typography.Paragraph type="secondary">Its booking is reversed (kept in the journal) and the invoice is open again for the amount it settled.</Typography.Paragraph>
        <Input.TextArea rows={2} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why, e.g. recorded on the wrong invoice" maxLength={300} />
      </Modal>
    </>
  );
}
