import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, App, Button, Checkbox, Col, Divider, Drawer, Dropdown, Flex, Form, Input, InputNumber, Row, Segmented, Select, Table, Tag, Tooltip, Typography } from "antd";
import type { MenuProps, TableColumnsType } from "antd";
import {
  CheckCircleOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  EditOutlined,
  FilePdfOutlined,
  FileTextOutlined,
  MoreOutlined,
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
import { CcNote } from "./quotations-page";
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
  const [editing, setEditing] = useState<Row | null>(null);
  const { run, busy } = useAction([["invoices"], ["quotations"]]);
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
      viewPdf(invoicePdf(target.id, target.number));
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
      return [row.number, row.bill_to_name, row.bill_to_company, row.quotation_number, row.license?.label].some((value) => (value ?? "").toLowerCase().includes(query));
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
      render: (_, row) => <InvoiceRowActions row={row} isApprover={isApprover} run={run} busy={busy} onEdit={() => setEditing(row)} />,
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
      />
      <InvoiceDetailsDrawer invoice={editing} onClose={() => setEditing(null)} />
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

  // Sending shows the PDF first; an approver sends, anyone else asks.
  const reviewAndSend = (again: boolean) =>
    viewPdf({
      ...invoicePdf(row.id, row.number),
      note: isApprover ? "Check it before it goes to the customer." : "Check it; an approver sends it to the customer.",
      recipients: row.bill_to_email ? { to: row.bill_to_email, cc: row.cc_emails } : undefined,
      action: {
        label: isApprover ? (again ? "Send again" : "Send to customer") : "Request approval",
        onClick: async () => {
          await run(k("send"), () => sendInvoice(row.id), isApprover ? "Sent to the customer." : "Sent for approval. The approvers have been emailed.");
        },
      },
    });
  const reviewAndApprove = () =>
    viewPdf({
      ...invoicePdf(row.id, row.number),
      note: `Asked by ${row.requester?.full_name ?? "a colleague"}. Approving makes it live for the customer${row.approval_sends ? " and emails it" : ""}.`,
      recipients: row.approval_sends && row.bill_to_email ? { to: row.bill_to_email, cc: row.cc_emails } : undefined,
      action: {
        label: row.approval_sends ? "Approve & send" : "Approve",
        onClick: async () => {
          await run(k("approve"), () => approveDocument("invoice", row.id), "Approved.");
        },
      },
    });

  let primary: React.ReactNode = null;
  if (row.status === "void") {
    primary = (
      <Button size="small" icon={<RollbackOutlined />} loading={busy === k("restore")} onClick={() => run(k("restore"), () => setInvoiceStatus(row.id, "unpaid"), "Invoice restored.")}>
        Restore
      </Button>
    );
  } else if (waiting) {
    primary = isApprover ? (
      <>
        <Button size="small" type="primary" icon={<CheckOutlined />} loading={busy === k("approve")} onClick={reviewAndApprove}>
          Review
        </Button>
        <Tooltip title="Reject">
          <Button size="small" danger type="text" icon={<CloseCircleOutlined />} loading={busy === k("reject")} onClick={() => setRejecting(true)} aria-label="Reject" />
        </Tooltip>
      </>
    ) : null;
  } else if (unsent) {
    primary = (
      <Button size="small" type="primary" icon={<SendOutlined />} loading={busy === k("send")} onClick={() => reviewAndSend(false)}>
        {isApprover ? "Send" : "Request approval"}
      </Button>
    );
  } else if (row.status === "unpaid") {
    primary = (
      <Button
        size="small"
        type="primary"
        icon={<CheckCircleOutlined />}
        loading={busy === k("paid")}
        onClick={() =>
          run(k("paid"), () => setInvoiceStatus(row.id, "paid"), `Marked paid. The customer${row.cc_emails?.length ? ` and ${row.cc_emails.length} in CC have` : " has"} been emailed a receipt.`)
        }
      >
        Mark paid
      </Button>
    );
  }

  const more: MenuProps["items"] = [
    ...(row.quotation_id
      ? [{ key: "quote", icon: <FileTextOutlined />, label: `Quotation ${row.quotation_number ?? ""}`, onClick: () => viewPdf(quotationPdf(row.quotation_id!, row.quotation_number)) }]
      : []),
    ...(row.quotation_id && !row.owner_id
      ? [{ key: "customer", icon: <UserOutlined />, label: "Link customer account", onClick: () => navigate(`/sales/quotations/${row.quotation_id}/customer`) }]
      : []),
    ...(approved && row.status === "unpaid"
      ? [{ key: "resend", icon: <SendOutlined />, label: isApprover ? "Send again" : "Send again (approval)", onClick: () => reviewAndSend(true) }]
      : []),
    ...(row.status === "paid"
      ? [{ key: "unpaid", icon: <UndoOutlined />, label: "Mark not paid", onClick: () => run(k("unpaid"), () => setInvoiceStatus(row.id, "unpaid"), "Marked not paid.") }]
      : []),
    { key: "history", icon: <ClockCircleOutlined />, label: "Approval history", onClick: () => setHistory(true) },
    ...(row.status !== "void"
      ? [
          { type: "divider" as const },
          { key: "void", icon: <StopOutlined />, label: "Void invoice", danger: true, onClick: () => run(k("void"), () => setInvoiceStatus(row.id, "void"), "Invoice voided.") },
        ]
      : []),
  ];

  return (
    <Flex gap={4} justify="flex-end" align="center" wrap={false}>
      {primary}
      <Tooltip title="View PDF">
        <Button size="small" type="text" icon={<FilePdfOutlined />} onClick={() => viewPdf(invoicePdf(row.id, row.number))} aria-label="View PDF" />
      </Tooltip>
      {row.status === "unpaid" ? (
        <Tooltip title="Edit">
          <Button size="small" type="text" icon={<EditOutlined />} onClick={onEdit} />
        </Tooltip>
      ) : null}
      <Dropdown menu={{ items: more }} trigger={["click"]} placement="bottomRight">
        <Button size="small" type="text" icon={<MoreOutlined />} aria-label={`More actions for ${row.number ?? "this invoice"}`} />
      </Dropdown>
      <RejectModal
        open={rejecting}
        title={title}
        onCancel={() => setRejecting(false)}
        onReject={(reason) => run(k("reject"), () => rejectDocument("invoice", row.id, reason), "Rejected. They have been told why.").then(() => setRejecting(false))}
      />
      <ApprovalHistoryModal type="invoice" id={row.id} title={title} open={history} onClose={() => setHistory(false)} />
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
  due_date: string;
  tax_rate: number;
  notes: string;
  refresh_seller: boolean;
  notify: boolean;
};

/**
 * Corrects an unpaid invoice: who pays, when, tax and notes. The lines are
 * what the customer accepted on the quotation and are not edited here; to
 * change what is sold, void the invoice, revise the quotation and convert again.
 */
function InvoiceDetailsDrawer({ invoice, onClose }: { invoice: Row | null; onClose: () => void }) {
  const [form] = Form.useForm<DetailValues>();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const taxRate = Form.useWatch("tax_rate", form);
  const billToEmail = Form.useWatch("bill_to_email", form);
  const materai = Form.useWatch("materai", form) ?? "none";
  const isApprover = useIsApprover();
  const ccWatched = Form.useWatch("cc_emails", form);

  const { data: groups } = useQuery({
    queryKey: ["invoice-groups", invoice?.id],
    enabled: Boolean(invoice),
    queryFn: async () => (await supabase.from("invoice_groups").select("label, quantity, subtotal").eq("invoice_id", invoice!.id).order("position")).data ?? [],
  });

  if (!invoice) return <Drawer open={false} onClose={onClose} />;
  const money = (amount: number) => formatMoney(amount, invoice.currency, invoice.decimal_places);
  const scale = 10 ** invoice.decimal_places;
  const rate = Number(taxRate ?? invoice.tax_rate) || 0;
  const tax = Math.round(((Number(invoice.subtotal) * rate) / 100) * scale) / scale;
  const ccCount = (ccWatched ?? invoice.cc_emails ?? []).length;

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
      title={`Edit ${invoice.number ?? "invoice"}`}
      size={560}
      destroyOnHidden
      extra={
        <Button type="primary" loading={pending} onClick={() => form.submit()}>
          Save invoice
        </Button>
      }
    >
      <Typography.Paragraph type="secondary">
        {invoice.quotation_number
          ? `The lines are as accepted on quotation ${invoice.quotation_number}. To change what is sold, void this invoice, revise the quotation and convert it again.`
          : "The lines are as issued. Billing details, due date, tax and notes can be corrected."}
      </Typography.Paragraph>
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

      <Divider titlePlacement="start">What is invoiced</Divider>
      <Flex vertical gap={6}>
        {(groups ?? []).map((group, index) => (
          <Flex key={index} justify="space-between">
            <Typography.Text type="secondary">
              {group.label} × {group.quantity}
            </Typography.Text>
            <span>{money(Number(group.subtotal))}</span>
          </Flex>
        ))}
        <Flex justify="space-between">
          <Typography.Text type="secondary">Subtotal</Typography.Text>
          <span>{money(Number(invoice.subtotal))}</span>
        </Flex>
        <Flex justify="space-between">
          <Typography.Text type="secondary">
            {invoice.tax_label} ({rate}%)
          </Typography.Text>
          <span>{money(tax)}</span>
        </Flex>
        <Flex justify="space-between">
          <Typography.Text strong>Total</Typography.Text>
          <Typography.Text strong>{money(Number(invoice.subtotal) + tax)}</Typography.Text>
        </Flex>
      </Flex>
    </Drawer>
  );
}
