import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Button, Dropdown, Flex, Input, Segmented, Table, Tag, Tooltip, Typography } from "antd";
import type { MenuProps, TableColumnsType } from "antd";
import {
  CalendarOutlined,
  CheckOutlined,
  CloseCircleOutlined,
  DislikeOutlined,
  EditOutlined,
  FilePdfOutlined,
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
import { quotationPdf, sendQuotation, setQuotationStatus } from "./api";
import { useAction } from "./use-action";

type Row = Quotation & {
  request: { reference: string } | null;
  invoices: { id: string; number: string | null; status: string }[];
  customer: { full_name: string | null; email: string | null } | null;
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

  const { data, isLoading } = useQuery({
    queryKey: ["quotations"],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("quotations")
        .select(
          "*, request:quote_requests(reference), invoices(id, number, status), customer:profiles!quotations_customer_id_fkey(full_name, email)",
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
      render: (_, row) => <RowActions row={row} canInvoice={canInvoice} run={run} busy={busy} />,
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
  run,
  busy,
}: {
  row: Row;
  canInvoice: boolean;
  run: ReturnType<typeof useAction>["run"];
  busy: string | null;
}) {
  const navigate = useNavigate();
  const viewPdf = usePdfViewer();
  const open = row.status === "draft" || row.status === "sent";
  const expired = isExpired(row);
  const invoice = row.invoices.find((candidate) => candidate.status !== "void");
  const k = (name: string) => `${name}:${row.id}`;
  // Sending shows the customer's PDF first; it goes out from the preview.
  const reviewAndSend = (again: boolean) =>
    viewPdf({
      ...quotationPdf(row.id, row.number),
      note: `Check it before it goes to ${row.contact_email}.`,
      action: {
        label: again ? "Send again" : "Send to customer",
        onClick: async () => {
          await run(k("send"), () => sendQuotation(row.id), again ? "Sent again." : "Sent. The customer has been emailed a link.");
        },
      },
    });

  // The one next step for this quotation.
  let primary: React.ReactNode = null;
  if (row.status === "draft" && row.contact_email) {
    primary = (
      <Button size="small" type="primary" icon={<SendOutlined />} loading={busy === k("send")} onClick={() => reviewAndSend(false)}>
        Send
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
      <Button size="small" icon={<TransactionOutlined />} onClick={() => navigate("/sales/invoices")}>
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
    ...(row.status === "sent" && row.contact_email && !expired
      ? [{ key: "resend", icon: <SendOutlined />, label: "Send again", onClick: () => reviewAndSend(true) }]
      : []),
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
    </Flex>
  );
}
