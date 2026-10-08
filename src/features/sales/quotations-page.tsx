import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Button, Dropdown, Flex, Input, Segmented, Table, Tag, Tooltip, Typography } from "antd";
import type { MenuProps, TableColumnsType } from "antd";
import {
  CalendarOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  DislikeOutlined,
  EditOutlined,
  FilePdfOutlined,
  MailOutlined,
  MoreOutlined,
  PlusOutlined,
  RedoOutlined,
  SendOutlined,
  TransactionOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { useCan } from "@/auth/use-auth";
import { PageTitle } from "@/components/app-shell";
import { formatInvoiceDate, formatMoney } from "@/lib/invoices";
import { isExpired, quotationState, type Quotation } from "@/lib/quotations";
import { supabase } from "@/lib/supabase";
import { usePdfViewer } from "@/components/pdf-viewer-context";
import { approveDocument, quotationPdf, rejectDocument, sendQuotation, setQuotationStatus } from "./api";
import { ApprovalHistoryModal, ApprovalNote, RejectModal, useIsApprover } from "./approvals";
import { useAction } from "./use-action";

type Row = Quotation & {
  request: { reference: string } | null;
  invoices: { id: string; number: string | null; status: string }[];
  customer: { full_name: string | null; email: string | null } | null;
  approver: { full_name: string | null } | null;
  requester: { full_name: string | null } | null;
};

const SOURCE_LABEL: Record<string, string> = { phone: "By phone", email: "By email", meeting: "From a meeting", other: "Made by hand" };
const TONE_COLOR: Record<string, string> = { draft: "default", open: "processing", expired: "warning", won: "success", closed: "default" };

type Filter = "all" | "draft" | "open" | "expired" | "won" | "closed";

export function QuotationStatusTag({ quotation }: { quotation: Pick<Quotation, "status" | "valid_until"> }) {
  const state = quotationState(quotation);
  return <Tag color={TONE_COLOR[state.tone]}>{state.label}</Tag>;
}

/** Every quotation, newest first, with what can be done to each. */
export function QuotationsPage() {
  const can = useCan();
  const navigate = useNavigate();
  const canInvoice = can("licenses.manage");
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const { run, busy } = useAction([["quotations"]]);
  const isApprover = useIsApprover();

  const { data, isLoading } = useQuery({
    queryKey: ["quotations"],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("quotations")
        .select(
          "*, request:quote_requests(reference), invoices(id, number, status), customer:profiles!quotations_customer_id_fkey(full_name, email), approver:profiles!quotations_approved_by_fkey(full_name), requester:profiles!quotations_approval_requested_by_fkey(full_name)",
        )
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (rows ?? []) as unknown as Row[];
    },
  });

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data ?? []).filter((row) => {
      if (filter !== "all" && quotationState(row).tone !== filter) return false;
      if (!query) return true;
      return [row.number, row.company, row.contact_name, row.contact_email, row.sales_name].some((value) =>
        (value ?? "").toLowerCase().includes(query),
      );
    });
  }, [data, filter, search]);

  const counts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const row of data ?? []) result[quotationState(row).tone] = (result[quotationState(row).tone] ?? 0) + 1;
    return result;
  }, [data]);

  const columns: TableColumnsType<Row> = [
    {
      title: "Quotation",
      key: "number",
      width: 170,
      render: (_, row) => (
        <Flex vertical>
          <Typography.Text style={{ fontFamily: "Geist Mono, monospace", fontSize: 13, whiteSpace: "nowrap" }}>{row.number ?? "—"}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {row.request ? (
              `From ${row.request.reference}`
            ) : row.source !== "website" ? (
              <Tooltip title={row.internal_note ?? undefined}>
                {SOURCE_LABEL[row.source] ?? row.source}
                {row.internal_note ? " · note" : ""}
              </Tooltip>
            ) : null}
          </Typography.Text>
        </Flex>
      ),
    },
    {
      title: "Prepared for",
      key: "customer",
      render: (_, row) => (
        <Flex vertical>
          <span>{row.company || row.contact_name}</span>
          {row.company ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {row.contact_name}
            </Typography.Text>
          ) : null}
          <CcNote cc={row.cc_emails} />
          {row.status !== "draft" ? (
            <Link to={`/sales/quotations/${row.id}/customer`} style={{ fontSize: 12 }}>
              {row.customer ? (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  <UserOutlined /> {row.customer.full_name || row.customer.email}
                </Typography.Text>
              ) : (
                <Typography.Text type="warning" style={{ fontSize: 12 }}>
                  No customer account yet
                </Typography.Text>
              )}
            </Link>
          ) : null}
        </Flex>
      ),
    },
    { title: "Contact", dataIndex: "sales_name", render: (value: string | null) => value ?? "—", responsive: ["lg"] },
    {
      title: "Valid until",
      dataIndex: "valid_until",
      render: (value: string) => formatInvoiceDate(value),
      sorter: (a, b) => a.valid_until.localeCompare(b.valid_until),
      responsive: ["md"],
    },
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
        <Flex vertical gap={2}>
          <QuotationStatusTag quotation={row} />
          <ApprovalNote
            state={row.approval_status}
            note={row.approval_note}
            requestedBy={row.requester?.full_name}
            approvedBy={row.approved_by ? row.approver?.full_name : null}
            approvedAt={row.approved_at}
            edited={row.status === "sent" && row.approval_status === "none"}
          />
          {row.status === "accepted" && row.accepted_late ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Accepted after expiry
            </Typography.Text>
          ) : null}
        </Flex>
      ),
    },
    {
      title: <span className="sr-only">Actions</span>,
      key: "actions",
      align: "right",
      render: (_, row) => <RowActions row={row} canInvoice={canInvoice} isApprover={isApprover} run={run} busy={busy} />,
    },
  ];

  return (
    <>
      <PageTitle
        title="Quotations"
        description="Build, send and track quotations. Accepted ones become invoices."
        actions={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate("/sales/quotations/new")}>
            New quotation
          </Button>
        }
      />
      <Flex wrap gap={12} justify="space-between" style={{ marginBottom: 16 }}>
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: `All ${data ? `(${data.length})` : ""}` },
            { value: "draft", label: `Draft (${counts.draft ?? 0})` },
            { value: "open", label: `Awaiting (${counts.open ?? 0})` },
            { value: "expired", label: `Expired (${counts.expired ?? 0})` },
            { value: "won", label: `Accepted (${counts.won ?? 0})` },
            { value: "closed", label: `Closed (${counts.closed ?? 0})` },
          ]}
        />
        <Input.Search allowClear placeholder="Search number, customer or contact" onChange={(event) => setSearch(event.target.value)} style={{ maxWidth: 320 }} />
      </Flex>
      <Table<Row>
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={rows}
        pagination={{ pageSize: 25, hideOnSinglePage: true, showSizeChanger: false }}
        scroll={{ x: 860 }}
        locale={{ emptyText: data && data.length > 0 ? "Nothing matches." : "No quotations yet." }}
      />
    </>
  );
}

function RowActions({
  row,
  canInvoice,
  isApprover,
  run,
  busy,
}: {
  row: Row;
  canInvoice: boolean;
  isApprover: boolean;
  run: ReturnType<typeof useAction>["run"];
  busy: string | null;
}) {
  const navigate = useNavigate();
  const viewPdf = usePdfViewer();
  const [rejecting, setRejecting] = useState(false);
  const [history, setHistory] = useState(false);
  const title = `quotation ${row.number ?? ""}`.trim();
  const waiting = row.approval_status === "pending";
  // An approver sends; anyone else asks an approver (the database decides).
  const sendLabel = isApprover ? "Send" : "Request approval";
  const open = row.status === "draft" || row.status === "sent";
  const expired = isExpired(row);
  const invoice = row.invoices.find((candidate) => candidate.status !== "void");
  const k = (name: string) => `${name}:${row.id}`;
  // Sending shows the customer's PDF first; it goes out from the preview.
  const reviewAndSend = (again: boolean) =>
    viewPdf({
      ...quotationPdf(row.id, row.number),
      note: isApprover ? "Check it, and who it goes to, before sending." : "Check it; an approver sends it to the customer.",
      recipients: row.contact_email ? { to: row.contact_email, cc: row.cc_emails } : undefined,
      action: {
        label: isApprover ? (again ? "Send again" : "Send to customer") : "Request approval",
        onClick: async () => {
          await run(
            k("send"),
            () => sendQuotation(row.id),
            isApprover ? (again ? "Sent again." : "Sent. The customer has been emailed a link.") : "Sent for approval. The approvers have been emailed.",
          );
        },
      },
    });
  // An approver's review of someone else's request: approving sends it.
  const reviewAndApprove = () =>
    viewPdf({
      ...quotationPdf(row.id, row.number),
      note: `Asked by ${row.requester?.full_name ?? "a colleague"}. Approving sends it to the customer now.`,
      recipients: row.contact_email ? { to: row.contact_email, cc: row.cc_emails } : undefined,
      action: {
        label: "Approve & send",
        onClick: async () => {
          await run(k("approve"), () => approveDocument("quotation", row.id), "Approved and sent to the customer.");
        },
      },
    });

  // The one next step for this quotation.
  let primary: React.ReactNode = null;
  if (waiting) {
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
  } else if (row.status === "draft" && row.contact_email) {
    primary = (
      <Button size="small" type="primary" icon={<SendOutlined />} loading={busy === k("send")} onClick={() => reviewAndSend(false)}>
        {sendLabel}
      </Button>
    );
  } else if (row.status === "sent" && row.approval_status !== "approved" && row.contact_email && !expired) {
    // Edited or not approved since it was sent: the customer's link is paused.
    primary = (
      <Button size="small" type="primary" icon={<SendOutlined />} loading={busy === k("send")} onClick={() => reviewAndSend(true)}>
        {isApprover ? "Send again" : "Request approval"}
      </Button>
    );
  } else if (expired) {
    primary = (
      <Button size="small" icon={<CalendarOutlined />} onClick={() => navigate(`/sales/quotations/${row.id}/edit`)}>
        Renew
      </Button>
    );
  } else if (row.status === "sent") {
    primary = (
      <Button size="small" icon={<CheckOutlined />} loading={busy === k("accept")} onClick={() => run(k("accept"), () => setQuotationStatus(row.id, "accepted"), "Marked accepted.")}>
        Mark accepted
      </Button>
    );
  } else if (invoice) {
    primary = (
      <Button size="small" icon={<TransactionOutlined />} onClick={() => navigate(`/sales/invoices?invoice=${invoice.id}`)}>
        {invoice.number}
      </Button>
    );
  } else if (row.status === "accepted" && canInvoice) {
    primary = (
      <Button size="small" type="primary" icon={<TransactionOutlined />} onClick={() => navigate(`/sales/quotations/${row.id}/convert`)}>
        Convert to invoice
      </Button>
    );
  }

  const more: MenuProps["items"] = [
    ...(row.status === "sent" && row.contact_email && !expired && !waiting && row.approval_status === "approved"
      ? [{ key: "resend", icon: <SendOutlined />, label: isApprover ? "Send again" : "Send again (approval)", onClick: () => reviewAndSend(true) }]
      : []),
    { key: "history", icon: <ClockCircleOutlined />, label: "Approval history", onClick: () => setHistory(true) },
    ...(row.status === "sent" && expired
      ? [{ key: "late", icon: <CheckOutlined />, label: "Accept anyway (expired)", onClick: () => run(k("accept"), () => setQuotationStatus(row.id, "accepted", true), "Accepted after expiry.") }]
      : []),
    ...(row.status === "sent"
      ? [{ key: "decline", icon: <DislikeOutlined />, label: "Mark declined", onClick: () => run(k("decline"), () => setQuotationStatus(row.id, "declined"), "Marked declined.") }]
      : []),
    ...(row.status !== "draft" ? [{ key: "customer", icon: <UserOutlined />, label: "Customer account", onClick: () => navigate(`/sales/quotations/${row.id}/customer`) }] : []),
    ...(!open && !invoice
      ? [{ key: "reopen", icon: <RedoOutlined />, label: "Reopen", onClick: () => run(k("reopen"), () => setQuotationStatus(row.id, row.sent_at ? "sent" : "draft"), "Reopened.") }]
      : []),
    ...(open
      ? [
          { type: "divider" as const },
          { key: "cancel", icon: <CloseCircleOutlined />, label: "Cancel quotation", danger: true, onClick: () => run(k("cancel"), () => setQuotationStatus(row.id, "cancelled"), "Cancelled.") },
        ]
      : []),
  ];

  return (
    <Flex gap={4} justify="flex-end" align="center" wrap={false}>
      {primary}
      <Tooltip title="View PDF">
        <Button size="small" type="text" icon={<FilePdfOutlined />} onClick={() => viewPdf(quotationPdf(row.id, row.number))} aria-label="View PDF" />
      </Tooltip>
      {open ? (
        <Tooltip title="Edit">
          <Button size="small" type="text" icon={<EditOutlined />} onClick={() => navigate(`/sales/quotations/${row.id}/edit`)} />
        </Tooltip>
      ) : null}
      <Dropdown menu={{ items: more }} trigger={["click"]} placement="bottomRight" disabled={more.length === 0}>
        <Button size="small" type="text" icon={<MoreOutlined />} aria-label={`More actions for ${row.number ?? "this quotation"}`} />
      </Dropdown>
      <RejectModal
        open={rejecting}
        title={title}
        onCancel={() => setRejecting(false)}
        onReject={(reason) => run(k("reject"), () => rejectDocument("quotation", row.id, reason), "Rejected. They have been told why.").then(() => setRejecting(false))}
      />
      <ApprovalHistoryModal type="quotation" id={row.id} title={title} open={history} onClose={() => setHistory(false)} />
    </Flex>
  );
}

/** "+2 in CC", with the addresses on hover. */
export function CcNote({ cc }: { cc: string[] | null | undefined }) {
  if (!cc?.length) return null;
  return (
    <Tooltip
      title={
        <>
          Also emailed (CC):
          {cc.map((email) => (
            <div key={email}>{email}</div>
          ))}
        </>
      }
    >
      <Typography.Text type="secondary" style={{ fontSize: 12, cursor: "default" }}>
        <MailOutlined /> +{cc.length} in CC
      </Typography.Text>
    </Tooltip>
  );
}
