import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, App, Button, Checkbox, Col, Drawer, Dropdown, Flex, Form, Input, InputNumber, Row, Segmented, Select, Table, Tabs, Tag, Typography } from "antd";
import type { MenuProps, TableColumnsType } from "antd";
import {
  CheckCircleOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  DownloadOutlined,
  EditOutlined,
  EyeOutlined,
  FilePdfOutlined,
  FileProtectOutlined,
  FileTextOutlined,
  MoreOutlined,
  PaperClipOutlined,
  ProfileOutlined,
  RollbackOutlined,
  SendOutlined,
  StopOutlined,
  UndoOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { PageTitle } from "@/components/app-shell";
import { formatInvoiceDate, formatMoney, isOverdue, type Invoice } from "@/lib/invoices";
import { errorText } from "@/lib/sales";
import { supabase } from "@/lib/supabase";
import { EmailListInput, ccRules, normaliseEmails } from "@/components/email-list-input";
import { usePdfViewer } from "@/components/pdf-viewer-context";
import { approveDocument, invoicePdf, quotationPdf, rejectDocument, sendInvoice, setInvoiceMaterai, setInvoiceStatus, type Materai, type SignatureMode } from "./api";
import { ApprovalHistoryModal, ApprovalNote, RejectModal, useIsApprover } from "./approvals";
import { CcNote } from "./quotation-parts";
import { DocumentHistory } from "./document-history";
import { SigningActions, SigningTag, useSigningMenu } from "./signing";
import { DocumentLines } from "./document-lines";
import { InfoSection, StandingPanel, StatRow, Totals } from "./drawer-parts";
import { needsSigning, purchaseOrderPdf, setInvoicePurchaseOrder, signingHint, signingState } from "./api";
import { PurchaseOrderField, type PurchaseOrderChange } from "./purchase-order-field";
import { useAction } from "./use-action";

type Row = Invoice & {
  license: { label: string } | null;
  approver: { full_name: string | null } | null;
  requester: { full_name: string | null } | null;
};

/** Over this, an IDR document usually carries a Rp10.000 materai (UU 10/2020). */
const MATERAI_THRESHOLD_IDR = 5_000_000;
export const needsMateraiHint = (invoice: Pick<Invoice, "currency" | "total">, materai: string) =>
  invoice.currency === "IDR" && Number(invoice.total) > MATERAI_THRESHOLD_IDR && materai === "none";
type Filter = "all" | "unpaid" | "overdue" | "paid" | "void";

export function InvoiceStatusTag({ invoice }: { invoice: Pick<Invoice, "status" | "due_date"> }) {
  if (isOverdue(invoice)) return <Tag color="error">Overdue</Tag>;
  if (invoice.status === "unpaid") return <Tag color="warning">Payment required</Tag>;
  if (invoice.status === "paid") return <Tag color="success">Paid</Tag>;
  return <Tag>Void</Tag>;
}

/** Every invoice, newest first. Invoices are made by converting an accepted quotation. */
export function InvoicesPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [params, setParams] = useSearchParams();
  const viewPdf = usePdfViewer();
  const [openId, setOpenId] = useState<string | null>(null);
  const { run, busy } = useAction([["invoices"], ["quotations"], ["history"]]);
  const isApprover = useIsApprover();

  const { data, isLoading, error } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      // Named link: licences also point at invoices (licenses.invoice_id).
      const { data: rows, error: loadError } = await supabase
        .from("invoices")
        .select(
          "*, license:licenses!invoices_license_id_fkey(label), approver:profiles!invoices_approved_by_fkey(full_name), requester:profiles!invoices_approval_requested_by_fkey(full_name)",
        )
        .order("created_at", { ascending: false })
        .limit(1000);
      if (loadError) throw loadError;
      return (rows ?? []) as unknown as Row[];
    },
  });

  // Opened from a quotation (?invoice=<id>): show that invoice — the list
  // narrowed to it, and its PDF — then forget the link.
  const linked = params.get("invoice");
  useEffect(() => {
    if (!linked || !data) return;
    const target = data.find((row) => row.id === linked);
    if (target) {
      setFilter("all");
      setSearch(target.number ?? "");
      // To sign: the drawer, where it is downloaded and uploaded; otherwise its PDF.
      if (signingState(target) !== "none") setOpenId(target.id);
      else viewPdf(invoicePdf(target.id, target.number));
    }
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.delete("invoice");
      return next;
    }, { replace: true });
  }, [linked, data, setParams, viewPdf]);

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data ?? []).filter((row) => {
      const state = isOverdue(row) ? "overdue" : row.status;
      if (filter !== "all" && !(filter === state || (filter === "unpaid" && row.status === "unpaid"))) return false;
      if (!query) return true;
      return [row.number, row.bill_to_name, row.bill_to_company, row.quotation_number, row.po_number, row.license?.label].some((value) => (value ?? "").toLowerCase().includes(query));
    });
  }, [data, filter, search]);

  const outstanding = (data ?? []).filter((row) => row.status === "unpaid");

  const columns: TableColumnsType<Row> = [
    {
      title: "Invoice",
      key: "number",
      width: 170,
      render: (_, row) => (
        <Flex vertical>
          <Typography.Text style={{ fontFamily: "Geist Mono, monospace", fontSize: 13, whiteSpace: "nowrap" }}>{row.number}</Typography.Text>
          {row.quotation_number ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Quotation ref. {row.quotation_number}
            </Typography.Text>
          ) : null}
          {row.po_number || row.po_path ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {row.po_number ? `PO ref. ${row.po_number}` : "PO attached"}
              {row.po_number && row.po_path ? <PaperClipOutlined style={{ marginLeft: 4 }} aria-label="PO attached" /> : null}
            </Typography.Text>
          ) : null}
        </Flex>
      ),
    },
    {
      title: "Invoiced to",
      key: "to",
      render: (_, row) => (
        <Flex vertical>
          <span>{row.bill_to_name}</span>
          {row.license?.label && row.license.label !== row.bill_to_name ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Licence: {row.license.label}
            </Typography.Text>
          ) : null}
          {!row.owner_id ? (
            <Typography.Text type="warning" style={{ fontSize: 12 }}>
              Awaiting customer account
            </Typography.Text>
          ) : null}
          <CcNote cc={row.cc_emails} />
        </Flex>
      ),
    },
    { title: "Issued", dataIndex: "issue_date", render: (value: string) => formatInvoiceDate(value), responsive: ["lg"] },
    { title: "Due", dataIndex: "due_date", render: (value: string) => formatInvoiceDate(value), sorter: (a, b) => a.due_date.localeCompare(b.due_date), responsive: ["md"] },
    {
      title: "Total",
      key: "total",
      align: "right",
      render: (_, row) => <Typography.Text strong>{formatMoney(row.total, row.currency, row.decimal_places)}</Typography.Text>,
      sorter: (a, b) => Number(a.total) - Number(b.total),
    },
    {
      title: "Status",
      key: "status",
      render: (_, row) => (
        <Flex vertical gap={2} align="flex-start">
          <InvoiceStatusTag invoice={row} />
          <SigningTag row={row} />
          {row.approval_status === "none" && row.send_count === 0 && row.status !== "void" ? (
            <Tag icon={<SendOutlined />} style={{ marginInlineEnd: 0 }}>
              Not sent
            </Tag>
          ) : (
            <ApprovalNote
              state={row.approval_status}
              note={row.approval_note}
              requestedBy={row.requester?.full_name}
              approvedBy={row.approved_by ? row.approver?.full_name : null}
              approvedAt={row.approved_at}
            />
          )}
        </Flex>
      ),
    },
    {
      title: <span className="sr-only">Actions</span>,
      key: "actions",
      align: "right",
      render: (_, row) => <InvoiceRowActions row={row} isApprover={isApprover} run={run} busy={busy} onEdit={() => setOpenId(row.id)} />,
    },
  ];

  return (
    <>
      <PageTitle
        title="Invoices"
        description={`${outstanding.length > 0 ? `${outstanding.length} not paid. ` : ""}Invoices are made from accepted quotations — Convert to invoice in Quotations.`}
      />
      {error ? <Alert type="error" showIcon title="The invoices could not be loaded. Please reload the page." style={{ marginBottom: 16 }} /> : null}
      <Flex wrap gap={12} justify="space-between" style={{ marginBottom: 16 }}>
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "unpaid", label: "Not paid" },
            { value: "overdue", label: "Overdue" },
            { value: "paid", label: "Paid" },
            { value: "void", label: "Void" },
          ]}
        />
        <Input.Search
          allowClear
          value={search}
          placeholder="Search number, customer or quotation"
          onChange={(event) => setSearch(event.target.value)}
          style={{ maxWidth: 320 }}
        />
      </Flex>
      <Table<Row>
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={rows}
        pagination={{ pageSize: 25, hideOnSinglePage: true, showSizeChanger: false }}
        scroll={{ x: 860 }}
        locale={{ emptyText: data && data.length > 0 ? "Nothing matches." : "No invoices yet." }}
        onRow={(row) => ({ onClick: () => setOpenId(row.id), style: { cursor: "pointer" } })}
      />
      <InvoiceDetailsDrawer
        key={openId ?? "closed"}
        invoice={(openId && data?.find((row) => row.id === openId)) || null}
        onClose={() => setOpenId(null)}
        isApprover={isApprover}
        run={run}
        busy={busy}
      />
    </>
  );
}

function InvoiceRowActions({
  row,
  isApprover,
  run,
  busy,
  onEdit,
}: {
  row: Row;
  isApprover: boolean;
  run: ReturnType<typeof useAction>["run"];
  busy: string | null;
  onEdit: () => void;
}) {
  const navigate = useNavigate();
  const viewPdf = usePdfViewer();
  const [rejecting, setRejecting] = useState(false);
  const [history, setHistory] = useState(false);
  const k = (name: string) => `${name}:${row.id}`;
  const title = `invoice ${row.number ?? ""}`.trim();
  const waiting = row.approval_status === "pending";
  const approved = row.approval_status === "approved";
  const unsent = !waiting && !approved;
  const signing = signingState(row);
  // Signed by hand or with materai: an approver's "send" approves it for signing.
  const toSign = needsSigning(row);

  // Sending shows the PDF first; an approver sends, anyone else asks.
  const reviewAndSend = (again: boolean) =>
    viewPdf({
      ...invoicePdf(row.id, row.number),
      note: isApprover
        ? toSign
          ? "Check it. Approving makes it ready to sign: download it, sign or stamp it, then upload the signed copy to send it."
          : "Check it before it goes to the customer."
        : "Check it; an approver sends it to the customer.",
      recipients: row.bill_to_email && !(isApprover && toSign) ? { to: row.bill_to_email, cc: row.cc_emails } : undefined,
      action: {
        label: isApprover ? (toSign ? "Approve & download to sign" : again ? "Send again" : "Send to customer") : "Request approval",
        onClick: async () => {
          let result = null as string | null;
          const ok = await run(
            k("send"),
            async () => {
              result = await sendInvoice(row.id);
            },
            isApprover ? (toSign ? "Approved. Download it, sign or stamp it, then upload the signed copy." : "Sent to the customer.") : "Sent for approval. The approvers have been emailed.",
          );
          if (ok && result === "to_sign") downloadToSign();
        },
      },
    });
  const downloadToSign = () =>
    viewPdf({ ...invoicePdf(row.id, row.number, { original: true }), note: "Print and sign it, or stamp it on your e-Meterai provider's site — then upload the signed copy." });
  const reviewAndApprove = () =>
    viewPdf({
      ...invoicePdf(row.id, row.number),
      note: toSign
        ? `Asked by ${row.requester?.full_name ?? "a colleague"}. Once approved, download it to sign or stamp; it is sent with the signed copy.`
        : `Asked by ${row.requester?.full_name ?? "a colleague"}. Approving makes it live for the customer${row.approval_sends ? " and emails it" : ""}.`,
      recipients: row.approval_sends && row.bill_to_email && !toSign ? { to: row.bill_to_email, cc: row.cc_emails } : undefined,
      action: {
        label: toSign ? "Approve & download to sign" : row.approval_sends ? "Approve & send" : "Approve",
        onClick: async () => {
          const ok = await run(k("approve"), () => approveDocument("invoice", row.id), toSign ? "Approved. Download it, sign or stamp it, then upload the signed copy." : "Approved.");
          if (ok && toSign) downloadToSign();
        },
      },
    });

  const signingMenu = useSigningMenu({ type: "invoice", row, isApprover, run });
  type Item = { key: string; icon: React.ReactNode; label: string; onClick: () => unknown; danger?: boolean };
  const markPaid = () =>
    run(k("paid"), () => setInvoiceStatus(row.id, "paid"), `Marked paid. The customer${row.cc_emails?.length ? ` and ${row.cc_emails.length} in CC have` : " has"} been emailed a receipt.`);

  // What to do next — the step this invoice is waiting for.
  const next: Item[] = [];
  if (row.status === "void") {
    next.push({ key: "restore", icon: <RollbackOutlined />, label: "Restore invoice", onClick: () => run(k("restore"), () => setInvoiceStatus(row.id, "unpaid"), "Invoice restored.") });
  } else if (signing === "to_sign" || signing === "needs_check" || signing === "ready") {
    next.push(...signingMenu.items.filter((item) => item.key !== "view-signed"));
  } else if (waiting) {
    if (isApprover) {
      next.push({ key: "review", icon: <CheckOutlined />, label: "Review & approve", onClick: reviewAndApprove });
      next.push({ key: "reject", icon: <CloseCircleOutlined />, label: "Reject…", onClick: () => setRejecting(true), danger: true });
    }
  } else if (unsent) {
    next.push({
      key: "send",
      icon: isApprover && toSign ? <DownloadOutlined /> : <SendOutlined />,
      label: isApprover ? (toSign ? "Download to sign" : "Send to customer") : "Request approval",
      onClick: () => reviewAndSend(false),
    });
  } else if (row.status === "unpaid") {
    next.push({ key: "paid", icon: <CheckCircleOutlined />, label: "Mark paid", onClick: markPaid });
  }

  const view: Item[] = [
    { key: "details", icon: <ProfileOutlined />, label: "Details & history", onClick: onEdit },
    { key: "pdf", icon: <FilePdfOutlined />, label: "View PDF", onClick: () => viewPdf(invoicePdf(row.id, row.number)) },
    ...signingMenu.items.filter((item) => item.key === "view-signed"),
    ...(row.po_path ? [{ key: "po", icon: <FileProtectOutlined />, label: "View purchase order", onClick: () => viewPdf(purchaseOrderPdf({ ...row, po_path: row.po_path! })) }] : []),
    ...(row.quotation_id
      ? [{ key: "quote", icon: <FileTextOutlined />, label: `Quotation ${row.quotation_number ?? ""}`.trim(), onClick: () => viewPdf(quotationPdf(row.quotation_id!, row.quotation_number)) }]
      : []),
    { key: "history", icon: <ClockCircleOutlined />, label: "Approval history", onClick: () => setHistory(true) },
  ];

  const change: Item[] = [
    ...(row.status === "unpaid" ? [{ key: "edit", icon: <EditOutlined />, label: "Edit details", onClick: onEdit }] : []),
    ...(approved && row.status === "unpaid" && (signing === "none" || signing === "sent")
      ? [{ key: "resend", icon: <SendOutlined />, label: isApprover ? "Send again" : "Send again (approval)", onClick: () => reviewAndSend(true) }]
      : []),
    ...(row.quotation_id && !row.owner_id
      ? [{ key: "customer", icon: <UserOutlined />, label: "Link customer account", onClick: () => navigate(`/sales/quotations/${row.quotation_id}/customer`) }]
      : []),
    ...(row.status === "paid" ? [{ key: "unpaid", icon: <UndoOutlined />, label: "Mark not paid", onClick: () => run(k("unpaid"), () => setInvoiceStatus(row.id, "unpaid"), "Marked not paid.") }] : []),
  ];

  const group = (label: string, items: Item[]) => (items.length ? [{ type: "group" as const, label, children: items }] : []);
  const menu: MenuProps["items"] = [
    ...group("Next step", next),
    ...group("View", view),
    ...group("Change", change),
    ...(row.status !== "void"
      ? [
          { type: "divider" as const },
          { key: "void", icon: <StopOutlined />, label: "Void invoice", danger: true, onClick: () => run(k("void"), () => setInvoiceStatus(row.id, "void"), "Invoice voided.") },
        ]
      : []),
  ];
  const working = Boolean(busy?.endsWith(`:${row.id}`));

  return (
    <Flex justify="flex-end" onClick={(event) => event.stopPropagation()}>
      <Dropdown menu={{ items: menu }} trigger={["click"]} placement="bottomRight">
        <Button
          size="small"
          type={next.length ? "default" : "text"}
          icon={<MoreOutlined />}
          loading={working}
          aria-label={`Actions for ${row.number ?? "this invoice"}`}
          style={next.length ? { borderColor: "var(--ant-color-primary)", color: "var(--ant-color-primary)" } : undefined}
        />
      </Dropdown>
      <RejectModal
        open={rejecting}
        title={title}
        onCancel={() => setRejecting(false)}
        onReject={(reason) => run(k("reject"), () => rejectDocument("invoice", row.id, reason), "Rejected. They have been told why.").then(() => setRejecting(false))}
      />
      <ApprovalHistoryModal type="invoice" id={row.id} title={title} open={history} onClose={() => setHistory(false)} />
      {signingMenu.modal}
    </Flex>
  );
}

type DetailValues = {
  bill_to_name: string;
  bill_to_company: string;
  bill_to_email: string;
  cc_emails: string[];
  materai: Materai;
  signature_mode: SignatureMode;
  bill_to_address: string;
  licensee_name: string;
  licensee_address: string;
  po_number: string;
  due_date: string;
  tax_rate: number;
  notes: string;
  refresh_seller: boolean;
  notify: boolean;
};

/**
 * One invoice: its details (editable while unpaid: who pays, when, tax and
 * notes), where it stands — approval and the signed copy — what is invoiced,
 * and its full history. The lines are what the customer accepted on the
 * quotation and are not edited here; to change what is sold, void the
 * invoice, revise the quotation and convert again.
 */
function InvoiceDetailsDrawer({
  invoice,
  onClose,
  isApprover,
  run,
  busy,
}: {
  invoice: Row | null;
  onClose: () => void;
  isApprover: boolean;
  run: ReturnType<typeof useAction>["run"];
  busy: string | null;
}) {
  const [form] = Form.useForm<DetailValues>();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The PO file: kept, replaced or removed when the invoice is saved.
  const [poChange, setPoChange] = useState<PurchaseOrderChange>({ kind: "keep" });
  const taxRate = Form.useWatch("tax_rate", form);
  const billToEmail = Form.useWatch("bill_to_email", form);
  const materai = Form.useWatch("materai", form) ?? "none";
  const viewPdf = usePdfViewer();
  const ccWatched = Form.useWatch("cc_emails", form);

  const [tab, setTab] = useState("overview");
  const { data: lines } = useQuery({
    queryKey: ["invoice-lines", invoice?.id],
    enabled: Boolean(invoice),
    queryFn: async () => {
      const [{ data: groups }, { data: items }] = await Promise.all([
        supabase.from("invoice_groups").select("id, label, quantity, subtotal").eq("invoice_id", invoice!.id).order("position"),
        supabase.from("invoice_items").select("id, group_id, description, detail, amount, edition_id").eq("invoice_id", invoice!.id).order("position"),
      ]);
      return { groups: groups ?? [], items: items ?? [] };
    },
  });

  if (!invoice) return <Drawer open={false} onClose={onClose} />;
  const money = (amount: number) => formatMoney(amount, invoice.currency, invoice.decimal_places);
  const scale = 10 ** invoice.decimal_places;
  const rate = Number((invoice.status === "unpaid" ? taxRate : undefined) ?? invoice.tax_rate) || 0;
  const tax = Math.round(((Number(invoice.subtotal) * rate) / 100) * scale) / scale;
  const ccCount = (ccWatched ?? invoice.cc_emails ?? []).length;
  const editable = invoice.status === "unpaid";

  const save = async (values: DetailValues) => {
    setPending(true);
    setError(null);
    // Materai and how it is signed only change the PDF, not what is owed: no approval needed.
    if (values.signature_mode !== invoice.signature_mode) {
      const { error: modeError } = await supabase.from("invoices").update({ signature_mode: values.signature_mode }).eq("id", invoice.id);
      if (modeError) {
        setPending(false);
        return setError(errorText(modeError, "The signature setting could not be saved."));
      }
    }
    if (values.materai !== invoice.materai) {
      try {
        await setInvoiceMaterai(invoice.id, values.materai);
      } catch (cause) {
        setPending(false);
        return setError(errorText(cause as { code?: string; message?: string }, "The materai setting could not be saved."));
      }
    }
    // Before the details: an "invoice changed" email then already knows about it.
    if (poChange.kind !== "keep") {
      try {
        await setInvoicePurchaseOrder(invoice, poChange.kind === "replace" ? poChange.file : null);
      } catch (cause) {
        setPending(false);
        return setError(errorText(cause as { code?: string; message?: string }, "The purchase order could not be saved. Please try again."));
      }
    }
    // First, so an "invoice changed" email (sent after commit) already has it.
    const { error: ccError } = await supabase.from("invoices").update({ cc_emails: normaliseEmails(values.cc_emails) }).eq("id", invoice.id);
    if (ccError) {
      setPending(false);
      return setError(errorText(ccError, "The CC list could not be saved. Check the addresses and try again."));
    }
    const { error: saveError } = await supabase.rpc("update_invoice_details", {
      p_invoice_id: invoice.id,
      p_bill_to_name: values.bill_to_name,
      p_bill_to_company: values.bill_to_company ?? "",
      p_bill_to_email: values.bill_to_email || undefined,
      p_bill_to_address: values.bill_to_address ?? "",
      p_licensee_name: values.licensee_name,
      p_licensee_address: values.licensee_address ?? "",
      p_po_number: values.po_number ?? "",
      p_notes: values.notes ?? "",
      p_due_date: values.due_date,
      p_tax_rate: Number(values.tax_rate) || 0,
      p_refresh_seller: values.refresh_seller,
      p_notify: values.notify,
    });
    setPending(false);
    if (saveError) return setError(errorText(saveError, "The invoice could not be saved. Please try again."));
    await queryClient.invalidateQueries({ queryKey: ["invoices"] });
    const throughApproval = !isApprover && (invoice.send_count > 0 || invoice.approval_status === "pending");
    message.success(
      throughApproval
        ? "Saved and sent for approval. The customer sees the change once an approver approves it."
        : values.notify && invoice.send_count > 0
          ? "Invoice saved, and the customer has been emailed the update."
          : "Invoice saved.",
    );
    onClose();
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={
        <Flex gap={8} align="center" wrap>
          <span style={{ fontFamily: "Geist Mono, monospace" }}>{invoice.number ?? "Invoice"}</span>
          <InvoiceStatusTag invoice={invoice} />
          <SigningTag row={invoice} />
        </Flex>
      }
      size={820}
      destroyOnHidden
      extra={
        <Flex gap={8}>
          <Button icon={<FilePdfOutlined />} onClick={() => viewPdf(invoicePdf(invoice.id, invoice.number))}>
            View PDF
          </Button>
          {editable ? (
            <Button type="primary" loading={pending} onClick={() => form.submit()}>
              Save invoice
            </Button>
          ) : null}
        </Flex>
      }
    >
      <Flex vertical gap={16}>
        <Typography.Text type="secondary">
          To <Typography.Text strong>{invoice.bill_to_name}</Typography.Text>
          {invoice.quotation_number ? ` · from quotation ${invoice.quotation_number}` : ""}
          {invoice.po_number ? ` · PO ${invoice.po_number}` : ""}
        </Typography.Text>
        <StatRow
          stats={[
            { label: invoice.status === "paid" ? "Paid" : "Amount due", value: money(Number(invoice.subtotal) + tax), strong: true },
            { label: "Issued", value: formatInvoiceDate(invoice.issue_date) },
            { label: invoice.status === "paid" ? "Paid on" : "Due", value: formatInvoiceDate(invoice.status === "paid" ? invoice.paid_at : invoice.due_date) },
            { label: "Servers", value: lines ? lines.groups.reduce((sum, group) => sum + group.quantity, 0) : "—" },
          ]}
        />
        <StandingPanel>
          <ApprovalNote
            state={invoice.approval_status}
            note={invoice.approval_note}
            requestedBy={invoice.requester?.full_name}
            approvedBy={invoice.approved_by ? invoice.approver?.full_name : null}
            approvedAt={invoice.approved_at}
          />
          {invoice.approval_status === "none" && invoice.send_count === 0 ? <Typography.Text type="secondary">Not sent yet.</Typography.Text> : null}
          {needsSigning(invoice) ? (
            <>
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                {signingHint(invoice)}
              </Typography.Text>
              <SigningActions type="invoice" row={invoice} isApprover={isApprover} run={run} busy={busy} size="middle" showView />
            </>
          ) : null}
        </StandingPanel>
        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={[
            {
              key: "overview",
              label: editable ? "Details" : "Overview",
              // Kept mounted, so the form keeps its edits while another tab is open.
              forceRender: true,
              children: (
                <>
          {editable ? (
            <>
              <Form<DetailValues>
                form={form}
                layout="vertical"
                requiredMark="optional"
                onFinish={save}
                disabled={pending}
                initialValues={{
                  bill_to_name: invoice.bill_to_name,
                  bill_to_company: invoice.bill_to_company ?? "",
                  bill_to_email: invoice.bill_to_email ?? "",
                  cc_emails: invoice.cc_emails ?? [],
                  materai: (invoice.materai as Materai) ?? "none",
                  signature_mode: (invoice.signature_mode as SignatureMode) ?? "digital",
                  bill_to_address: invoice.bill_to_address ?? "",
                  licensee_name: invoice.licensee_name || invoice.bill_to_name,
                  licensee_address: invoice.licensee_address ?? "",
                  po_number: invoice.po_number ?? "",
                  due_date: invoice.due_date,
                  tax_rate: Number(invoice.tax_rate),
                  notes: invoice.notes ?? "",
                  refresh_seller: true,
                  notify: true,
                }}
              >
                <Row gutter={16}>
                  <Col span={24}>
                    <Form.Item label="Invoiced to — name" name="bill_to_name" rules={[{ required: true, whitespace: true, message: "Enter who the invoice is to" }, { max: 200 }]}>
                      <Input />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Form.Item label="Company" name="bill_to_company" rules={[{ max: 200 }]}>
                      <Input />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Form.Item label="Billing email" name="bill_to_email" rules={[{ type: "email", message: "Enter a valid email" }]}>
                      <Input />
                    </Form.Item>
                  </Col>
                  <Col span={24}>
                    <Form.Item
                      label="CC"
                      name="cc_emails"
                      dependencies={["bill_to_email"]}
                      extra="Copied on every email about this invoice: the update below, and the payment receipt."
                      rules={ccRules(() => form.getFieldValue("bill_to_email"))}
                    >
                      <EmailListInput exclude={billToEmail} placeholder="Add people to copy, e.g. accounts@customer.com" />
                    </Form.Item>
                  </Col>
                </Row>
                <Form.Item label="Billing address" name="bill_to_address" rules={[{ max: 500 }]}>
                  <Input.TextArea rows={3} />
                </Form.Item>
                <Row gutter={16}>
                  <Col xs={24} sm={12}>
                    <Form.Item
                      label="Licence issued to"
                      name="licensee_name"
                      rules={[{ required: true, whitespace: true, message: "Enter who the licence is for" }, { max: 200 }]}
                      extra="The end user — the same as who pays, unless a reseller or head office pays."
                    >
                      <Input />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Form.Item label="Licensee address" name="licensee_address" rules={[{ max: 500 }]}>
                      <Input.TextArea rows={2} />
                    </Form.Item>
                  </Col>
                </Row>
                <div style={{ margin: "4px 0 20px", padding: 16, borderRadius: 10, border: "1px solid var(--ant-color-border-secondary)" }}>
                  <Flex align="center" gap={8} style={{ marginBottom: 12 }}>
                    <FileProtectOutlined style={{ color: "var(--ant-color-primary)" }} />
                    <Typography.Text strong>Customer's purchase order</Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      optional
                    </Typography.Text>
                  </Flex>
                  <Row gutter={[16, 16]}>
                    <Col span={24}>
                      <Form.Item
                        label="PO number"
                        name="po_number"
                        rules={[{ max: 60, message: "60 characters at most" }]}
                        extra="Printed on the invoice and in the emails."
                        style={{ marginBottom: 0 }}
                      >
                        <Input placeholder="e.g. PO-2026-0412" allowClear />
                      </Form.Item>
                    </Col>
                    <Col span={24}>
                      <Form.Item label="PO document" style={{ marginBottom: 0 }}>
                        <PurchaseOrderField
                          current={invoice.po_path ? { name: invoice.po_file_name || "Purchase order" } : null}
                          change={poChange}
                          onChange={setPoChange}
                          onView={invoice.po_path ? () => viewPdf(purchaseOrderPdf({ ...invoice, po_path: invoice.po_path! })) : undefined}
                          disabled={pending}
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                </div>
                <Row gutter={16}>
                  <Col xs={24} sm={12}>
                    <Form.Item label="Due date" name="due_date" rules={[{ required: true, message: "Choose a due date" }]}>
                      <Input type="date" min={invoice.issue_date} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Form.Item label={`${invoice.tax_label} rate`} name="tax_rate" rules={[{ type: "number", min: 0, max: 100, message: "0 to 100" }]}>
                      <InputNumber min={0} max={100} suffix="%" style={{ width: "100%" }} />
                    </Form.Item>
                  </Col>
                </Row>
                <Form.Item label="Notes on the invoice" name="notes" rules={[{ max: 1000 }]}>
                  <Input.TextArea rows={3} />
                </Form.Item>
                <Row gutter={16}>
                  <Col xs={24} sm={12}>
                    <Form.Item label="Signature" name="signature_mode" extra="Digital: the company signature, added once approved. By hand: the space is left empty to sign on paper.">
                      <Select
                        options={[
                          { value: "digital", label: "Digital" },
                          { value: "wet", label: "Sign by hand" },
                        ]}
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Form.Item label="Materai" name="materai" extra="Physical: a box to stick a Rp10.000 materai on and sign across. e-Meterai: an empty space where the stamp goes — stamp the PDF on your e-Meterai provider's site.">
                      <Select
                        options={[
                          { value: "none", label: "None" },
                          { value: "physical", label: "Physical materai" },
                          { value: "e_meterai", label: "e-Meterai (space for the stamp)" },
                        ]}
                      />
                    </Form.Item>
                  </Col>
                </Row>
                {needsMateraiHint(invoice, materai) ? (
                  <Alert
                    type="info"
                    showIcon
                    style={{ marginBottom: 16 }}
                    title="Over Rp5.000.000"
                    description="Documents in IDR above Rp5.000.000 usually carry a Rp10.000 materai."
                  />
                ) : null}
                <Form.Item name="refresh_seller" valuePropName="checked" style={{ marginBottom: 8 }}>
                  <Checkbox>Use our current company and payment details</Checkbox>
                </Form.Item>
                <Form.Item name="notify" valuePropName="checked">
                  <Checkbox>
                    Email the customer{ccCount ? ` (and ${ccCount} in CC)` : ""} that the invoice changed
                    {isApprover ? "" : " — once approved"}
                  </Checkbox>
                </Form.Item>
              </Form>
              {error ? <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} /> : null}
            </>
          ) : (
            <>
              <Typography.Paragraph type="secondary">
                {invoice.status === "paid" ? "Paid invoices are kept as issued." : "Void invoices are kept as issued. Restore it to make changes."}
              </Typography.Paragraph>
              <InfoSection
                title="Details"
                items={[
                  { label: "Invoiced to", value: [invoice.bill_to_name, invoice.bill_to_company].filter(Boolean).join(" · ") },
                  { label: "Billing email", value: invoice.bill_to_email ?? "—" },
                  { label: "CC", value: invoice.cc_emails?.length ? invoice.cc_emails.join(", ") : "—" },
                  { label: "Billing address", value: <span style={{ whiteSpace: "pre-line" }}>{invoice.bill_to_address || "—"}</span> },
                  {
                    label: "Licence issued to",
                    value: <span style={{ whiteSpace: "pre-line" }}>{[invoice.licensee_name || invoice.bill_to_name, invoice.licensee_address].filter(Boolean).join("\n")}</span>,
                  },
                  {
                    label: "Purchase order",
                    value:
                      invoice.po_number || invoice.po_path ? (
                        <Flex gap={8} align="center" wrap>
                          {invoice.po_number ? <Typography.Text strong>{invoice.po_number}</Typography.Text> : null}
                          {invoice.po_path ? (
                            <Button size="small" icon={<EyeOutlined />} onClick={() => viewPdf(purchaseOrderPdf({ ...invoice, po_path: invoice.po_path! }))}>
                              {invoice.po_file_name || "View PO"}
                            </Button>
                          ) : null}
                        </Flex>
                      ) : (
                        "—"
                      ),
                  },
                  { label: "Signature", value: invoice.signature_mode === "wet" ? "Signed by hand" : "Digital" },
                  { label: "Materai", value: invoice.materai === "physical" ? "Physical materai" : invoice.materai === "e_meterai" ? "e-Meterai" : "None" },
                  { label: "Notes", wide: true, value: <span style={{ whiteSpace: "pre-line" }}>{invoice.notes || "—"}</span> },
                ]}
              />
            </>
          )}
                </>
              ),
            },
            {
              key: "lines",
              label: `Modules${lines ? ` (${lines.items.length})` : ""}`,
              children: (
                <Flex vertical gap={16}>
                  <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                    {invoice.quotation_number
                      ? `As accepted on quotation ${invoice.quotation_number}. To change what is sold, void this invoice, revise the quotation and convert it again.`
                      : "As issued."}
                  </Typography.Text>
                  <DocumentLines groups={lines?.groups ?? []} items={lines?.items ?? []} money={money} />
                  <Totals
                    rows={[
                      { label: "Subtotal", value: money(Number(invoice.subtotal)) },
                      { label: `${invoice.tax_label} (${rate}%)`, value: money(tax) },
                    ]}
                    total={{ label: invoice.status === "paid" ? "Paid" : "Total", value: money(Number(invoice.subtotal) + tax) }}
                  />
                </Flex>
              ),
            },
            { key: "history", label: "History", children: <DocumentHistory type="invoice" id={invoice.id} /> },
          ]}
        />
      </Flex>
    </Drawer>
  );
}
