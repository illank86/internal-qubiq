import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Button, Dropdown, Flex, Input, Segmented, Table, Tooltip, Typography } from "antd";
import type { MenuProps, TableColumnsType } from "antd";
import {
  CalendarOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  DislikeOutlined,
  DownloadOutlined,
  EditOutlined,
  FilePdfOutlined,
  MoreOutlined,
  PlusOutlined,
  ProfileOutlined,
  RedoOutlined,
  SendOutlined,
  TransactionOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { useCan } from "@/auth/use-auth";
import { PageTitle } from "@/components/app-shell";
import { formatInvoiceDate, formatMoney } from "@/lib/invoices";
import { isExpired, quotationState } from "@/lib/quotations";
import { supabase } from "@/lib/supabase";
import { usePdfViewer } from "@/components/pdf-viewer-context";
import { approveDocument, needsSigning, quotationPdf, rejectDocument, sendQuotation, setQuotationStatus } from "./api";
import { ApprovalHistoryModal, ApprovalNote, RejectModal, useIsApprover } from "./approvals";
import { useAction } from "./use-action";
import { CcNote, QuotationStatusTag } from "./quotation-parts";
import { QuotationDrawer, type QuotationRow } from "./quotation-drawer";
import { SigningTag, useSigningMenu } from "./signing";

type Row = QuotationRow;

const SOURCE_LABEL: Record<string, string> = { phone: "By phone", email: "By email", meeting: "From a meeting", other: "Made by hand" };

type Filter = "all" | "draft" | "open" | "expired" | "won" | "closed";

/** Every quotation, newest first, with what can be done to each. */
export function QuotationsPage() {
  const can = useCan();
  const navigate = useNavigate();
  const canInvoice = can("licenses.manage");
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const { run, busy } = useAction([["quotations"], ["history"]]);
  const [openId, setOpenId] = useState<string | null>(null);
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
          <SigningTag row={row} />
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
      render: (_, row) => <RowActions row={row} canInvoice={canInvoice} isApprover={isApprover} run={run} busy={busy} onOpen={() => setOpenId(row.id)} />,
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
        onRow={(row) => ({ onClick: () => setOpenId(row.id), style: { cursor: "pointer" } })}
      />
      <QuotationDrawer
        quotation={(openId && data?.find((row) => row.id === openId)) || null}
        onClose={() => setOpenId(null)}
        isApprover={isApprover}
        run={run}
        busy={busy}
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
  onOpen,
}: {
  row: Row;
  canInvoice: boolean;
  isApprover: boolean;
  run: ReturnType<typeof useAction>["run"];
  busy: string | null;
  onOpen: () => void;
}) {
  const navigate = useNavigate();
  const viewPdf = usePdfViewer();
  const [rejecting, setRejecting] = useState(false);
  const [history, setHistory] = useState(false);
  const title = `quotation ${row.number ?? ""}`.trim();
  const waiting = row.approval_status === "pending";
  // An approver sends; anyone else asks an approver (the database decides).
  // Signed by hand: an approver's "send" approves it to be downloaded and signed.
  const toSign = needsSigning(row);
  const sendLabel = isApprover ? (toSign ? "Download to sign" : "Send") : "Request approval";
  const open = row.status === "draft" || row.status === "sent";
  const expired = isExpired(row);
  const invoice = row.invoices.find((candidate) => candidate.status !== "void");
  const k = (name: string) => `${name}:${row.id}`;
  // Sending shows the customer's PDF first; it goes out from the preview.
  const reviewAndSend = (again: boolean) =>
    viewPdf({
      ...quotationPdf(row.id, row.number),
      note: isApprover
        ? toSign
          ? "Check it. Approving makes it ready to sign: download it, sign it, then upload the signed copy to send it."
          : "Check it, and who it goes to, before sending."
        : "Check it; an approver sends it to the customer.",
      recipients: row.contact_email && !(isApprover && toSign) ? { to: row.contact_email, cc: row.cc_emails } : undefined,
      action: {
        label: isApprover ? (toSign ? "Approve & download to sign" : again ? "Send again" : "Send to customer") : "Request approval",
        onClick: async () => {
          let result = null as string | null;
          const ok = await run(
            k("send"),
            async () => {
              result = await sendQuotation(row.id);
            },
            isApprover
              ? toSign
                ? "Approved. Download it, sign it, then upload the signed copy."
                : again
                  ? "Sent again."
                  : "Sent. The customer has been emailed a link."
              : "Sent for approval. The approvers have been emailed.",
          );
          if (ok && result === "to_sign") downloadToSign();
        },
      },
    });
  const downloadToSign = () =>
    viewPdf({ ...quotationPdf(row.id, row.number, { original: true }), note: "Print it and sign it by hand — then upload the signed copy to send it." });
  // An approver's review of someone else's request: approving sends it.
  const reviewAndApprove = () =>
    viewPdf({
      ...quotationPdf(row.id, row.number),
      note: toSign
        ? `Asked by ${row.requester?.full_name ?? "a colleague"}. Once approved, download it to sign; it is sent with the signed copy.`
        : `Asked by ${row.requester?.full_name ?? "a colleague"}. Approving sends it to the customer now.`,
      recipients: row.contact_email && !toSign ? { to: row.contact_email, cc: row.cc_emails } : undefined,
      action: {
        label: toSign ? "Approve & download to sign" : "Approve & send",
        onClick: async () => {
          const ok = await run(
            k("approve"),
            () => approveDocument("quotation", row.id),
            toSign ? "Approved. Download it, sign it, then upload the signed copy." : "Approved and sent to the customer.",
          );
          if (ok && toSign) downloadToSign();
        },
      },
    });

  const signingMenu = useSigningMenu({ type: "quotation", row, isApprover, run });
  type Item = { key: string; icon: React.ReactNode; label: string; onClick: () => unknown; danger?: boolean };
  const go = (path: string) => () => navigate(path);

  // What to do next — the step this quotation is waiting for.
  const next: Item[] = [];
  if (signingMenu.state === "to_sign" || signingMenu.state === "needs_check" || signingMenu.state === "ready") {
    next.push(...signingMenu.items.filter((item) => item.key !== "view-signed"));
  } else if (waiting) {
    if (isApprover) {
      next.push({ key: "review", icon: <CheckOutlined />, label: toSign ? "Review & approve" : "Review & send", onClick: reviewAndApprove });
      next.push({ key: "reject", icon: <CloseCircleOutlined />, label: "Reject…", onClick: () => setRejecting(true), danger: true });
    }
  } else if (row.status === "draft" && row.contact_email) {
    next.push({ key: "send", icon: isApprover && toSign ? <DownloadOutlined /> : <SendOutlined />, label: sendLabel, onClick: () => reviewAndSend(false) });
  } else if (row.status === "sent" && row.approval_status !== "approved" && row.contact_email && !expired) {
    // Edited or not approved since it was sent: the customer's link is paused.
    next.push({
      key: "send",
      icon: isApprover && toSign ? <DownloadOutlined /> : <SendOutlined />,
      label: isApprover ? (toSign ? "Download to sign" : "Send again") : "Request approval",
      onClick: () => reviewAndSend(true),
    });
  } else if (expired && open) {
    next.push({ key: "renew", icon: <CalendarOutlined />, label: "Renew", onClick: go(`/sales/quotations/${row.id}/edit`) });
  } else if (row.status === "sent") {
    next.push({ key: "accept", icon: <CheckOutlined />, label: "Mark accepted", onClick: () => run(k("accept"), () => setQuotationStatus(row.id, "accepted"), "Marked accepted.") });
  } else if (row.status === "accepted" && !invoice && canInvoice) {
    next.push({ key: "convert", icon: <TransactionOutlined />, label: "Convert to invoice", onClick: go(`/sales/quotations/${row.id}/convert`) });
  }

  const view: Item[] = [
    { key: "details", icon: <ProfileOutlined />, label: "Details & history", onClick: onOpen },
    { key: "pdf", icon: <FilePdfOutlined />, label: "View PDF", onClick: () => viewPdf(quotationPdf(row.id, row.number)) },
    ...signingMenu.items.filter((item) => item.key === "view-signed"),
    ...(invoice ? [{ key: "invoice", icon: <TransactionOutlined />, label: `Invoice ${invoice.number ?? ""}`.trim(), onClick: go(`/sales/invoices?invoice=${invoice.id}`) }] : []),
    ...(row.status !== "draft" ? [{ key: "customer", icon: <UserOutlined />, label: "Customer account", onClick: go(`/sales/quotations/${row.id}/customer`) }] : []),
    { key: "history", icon: <ClockCircleOutlined />, label: "Approval history", onClick: () => setHistory(true) },
  ];

  const change: Item[] = [
    ...(open && !next.some((item) => item.key === "renew") ? [{ key: "edit", icon: <EditOutlined />, label: "Edit lines & prices", onClick: go(`/sales/quotations/${row.id}/edit`) }] : []),
    ...(row.status === "sent" && row.contact_email && !expired && !waiting && row.approval_status === "approved" && (signingMenu.state === "none" || signingMenu.state === "sent")
      ? [{ key: "resend", icon: <SendOutlined />, label: isApprover ? "Send again" : "Send again (approval)", onClick: () => reviewAndSend(true) }]
      : []),
    ...(row.status === "sent" && expired
      ? [{ key: "late", icon: <CheckOutlined />, label: "Accept anyway (expired)", onClick: () => run(k("accept"), () => setQuotationStatus(row.id, "accepted", true), "Accepted after expiry.") }]
      : []),
    ...(row.status === "sent" ? [{ key: "decline", icon: <DislikeOutlined />, label: "Mark declined", onClick: () => run(k("decline"), () => setQuotationStatus(row.id, "declined"), "Marked declined.") }] : []),
    ...(!open && !invoice ? [{ key: "reopen", icon: <RedoOutlined />, label: "Reopen", onClick: () => run(k("reopen"), () => setQuotationStatus(row.id, row.sent_at ? "sent" : "draft"), "Reopened.") }] : []),
  ];

  const group = (label: string, items: Item[]) => (items.length ? [{ type: "group" as const, label, children: items }] : []);
  const menu: MenuProps["items"] = [
    ...group("Next step", next),
    ...group("View", view),
    ...group("Change", change),
    ...(open
      ? [
          { type: "divider" as const },
          { key: "cancel", icon: <CloseCircleOutlined />, label: "Cancel quotation", danger: true, onClick: () => run(k("cancel"), () => setQuotationStatus(row.id, "cancelled"), "Cancelled.") },
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
          aria-label={`Actions for ${row.number ?? "this quotation"}`}
          style={next.length ? { borderColor: "var(--ant-color-primary)", color: "var(--ant-color-primary)" } : undefined}
        />
      </Dropdown>
      <RejectModal
        open={rejecting}
        title={title}
        onCancel={() => setRejecting(false)}
        onReject={(reason) => run(k("reject"), () => rejectDocument("quotation", row.id, reason), "Rejected. They have been told why.").then(() => setRejecting(false))}
      />
      <ApprovalHistoryModal type="quotation" id={row.id} title={title} open={history} onClose={() => setHistory(false)} />
      {signingMenu.modal}
    </Flex>
  );
}

