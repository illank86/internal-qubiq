import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Button, Descriptions, Drawer, Flex, Form, Input, Popconfirm, Segmented, Select, Table, Tag, Typography } from "antd";
import type { TableColumnsType } from "antd";
import { DeleteOutlined, FileAddOutlined } from "@ant-design/icons";
import { useCan } from "@/auth/use-auth";
import { PageTitle } from "@/components/app-shell";
import type { Database } from "@/lib/database.types";
import { formatInvoiceDate, formatMoney } from "@/lib/invoices";
import { supabase } from "@/lib/supabase";
import { QuotationStatusTag } from "./quotation-parts";
import { useAction } from "./use-action";

type QuoteRequest = Database["public"]["Tables"]["quote_requests"]["Row"] & {
  quotations: { id: string; number: string | null; status: Database["public"]["Enums"]["quotation_status"]; valid_until: string; total: number; currency: string; decimal_places: number }[];
};
type Status = Database["public"]["Enums"]["quote_status"];

const STATUSES: Status[] = ["new", "contacted", "quoted", "won", "lost", "spam"];
const STATUS_COLOR: Record<Status, string> = { new: "processing", contacted: "default", quoted: "orange", won: "success", lost: "default", spam: "error" };

/** Licences configured on the pricing page and sent for a quote; each becomes a quotation. */
export function QuoteRequestsPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Status | "all">("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [open, setOpen] = useState<QuoteRequest | null>(null);
  const { run, busy } = useAction([["quote-requests"]]);
  // The inbox is leads.manage; making a quotation needs quotations.manage.
  const canQuote = useCan()("quotations.manage");

  const { data, isLoading } = useQuery({
    queryKey: ["quote-requests"],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("quote_requests")
        .select("*, quotations(id, number, status, valid_until, total, currency, decimal_places)")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (rows ?? []) as unknown as QuoteRequest[];
    },
  });

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data ?? []).filter(
      (row) =>
        (filter === "all" || row.status === filter) &&
        (!query || [row.reference, row.company, row.contact_name, row.contact_email].some((value) => (value ?? "").toLowerCase().includes(query))),
    );
  }, [data, filter, search]);

  const setStatus = (id: string, status: Status) =>
    run(`status:${id}`, async () => {
      const { error } = await supabase.from("quote_requests").update({ status }).eq("id", id);
      if (error) throw error;
    });

  const columns: TableColumnsType<QuoteRequest> = [
    { title: "Ref", dataIndex: "reference", width: 110, render: (value: string) => <Typography.Text style={{ fontFamily: "Geist Mono, monospace", fontSize: 13, whiteSpace: "nowrap" }}>{value}</Typography.Text> },
    {
      title: "From",
      key: "from",
      render: (_, row) => (
        <Flex vertical>
          <span>{row.company || row.contact_name}</span>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {row.contact_email}
          </Typography.Text>
        </Flex>
      ),
    },
    { title: "Edition", dataIndex: "edition_name", render: (value: string | null, row) => (row.is_custom ? <Tag>Custom</Tag> : value ? <Tag>{value}</Tag> : "—"), responsive: ["md"] },
    { title: "Modules", dataIndex: "module_count", align: "right", responsive: ["lg"] },
    {
      title: "Licence",
      key: "total",
      align: "right",
      render: (_, row) => (row.licence_total != null ? formatMoney(row.licence_total, row.currency ?? "USD") : "—"),
      responsive: ["md"],
    },
    {
      title: "Quotations",
      key: "quotations",
      render: (_, row) =>
        row.quotations.length > 0 ? (
          <Flex vertical gap={2}>
            {row.quotations.map((quotation) => (
              <Typography.Text key={quotation.id} style={{ fontSize: 12 }}>
                {quotation.number} <QuotationStatusTag quotation={quotation} />
              </Typography.Text>
            ))}
          </Flex>
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        ),
    },
    {
      title: "Status",
      dataIndex: "status",
      render: (status: Status, row) => (
        <Select<Status>
          size="small"
          value={status}
          loading={busy === `status:${row.id}`}
          onClick={(event) => event.stopPropagation()}
          onChange={(value) => setStatus(row.id, value)}
          options={STATUSES.map((value) => ({ value, label: <Tag color={STATUS_COLOR[value]}>{value}</Tag> }))}
          variant="borderless"
          style={{ width: 130 }}
        />
      ),
    },
    { title: "Received", dataIndex: "created_at", render: (value: string) => formatInvoiceDate(value), responsive: ["lg"] },
    {
      title: <span className="sr-only">Actions</span>,
      key: "actions",
      align: "right",
      render: (_, row) =>
        canQuote ? (
        <Button
          size="small"
          type={row.quotations.length === 0 ? "primary" : "default"}
          icon={<FileAddOutlined />}
          onClick={(event) => {
            event.stopPropagation();
            navigate(`/sales/quotations/new?request=${row.id}`);
          }}
        >
          Create quotation
        </Button>
        ) : null,
    },
  ];

  return (
    <>
      <PageTitle title="Quote requests" description="Licences configured on the pricing page and sent for a quote. Turn each into a quotation." />
      <Flex wrap gap={12} justify="space-between" style={{ marginBottom: 16 }}>
        <Segmented<Status | "all"> value={filter} onChange={setFilter} options={[{ value: "all", label: "All" }, ...STATUSES.map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) }))]} />
        <Flex gap={8}>
          {selected.length > 0 ? (
            <Popconfirm
              title={`Delete ${selected.length} request${selected.length === 1 ? "" : "s"}?`}
              description="This cannot be undone. Their quotations stay."
              okText="Delete"
              okButtonProps={{ danger: true }}
              onConfirm={() =>
                run("delete", async () => {
                  const { error } = await supabase.from("quote_requests").delete().in("id", selected);
                  if (error) throw error;
                  setSelected([]);
                }, "Deleted.")
              }
            >
              <Button danger icon={<DeleteOutlined />} loading={busy === "delete"}>
                Delete {selected.length}
              </Button>
            </Popconfirm>
          ) : null}
          <Input.Search allowClear placeholder="Search reference, company or email" onChange={(event) => setSearch(event.target.value)} style={{ width: 300 }} />
        </Flex>
      </Flex>
      <Table<QuoteRequest>
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={rows}
        rowSelection={{ selectedRowKeys: selected, onChange: (keys) => setSelected(keys as string[]) }}
        onRow={(record) => ({ onClick: () => setOpen(record), style: { cursor: "pointer" } })}
        pagination={{ pageSize: 25, hideOnSinglePage: true, showSizeChanger: false }}
        scroll={{ x: 980 }}
        locale={{ emptyText: "No quote requests yet." }}
      />
      <RequestDrawer request={open} onClose={() => setOpen(null)} run={run} busy={busy} />
    </>
  );
}

function RequestDrawer({ request, onClose, run, busy }: { request: QuoteRequest | null; onClose: () => void; run: ReturnType<typeof useAction>["run"]; busy: string | null }) {
  const navigate = useNavigate();
  const canQuote = useCan()("quotations.manage");
  if (!request) return <Drawer open={false} onClose={onClose} />;
  const modules = Array.isArray(request.modules) ? (request.modules as { name?: string; slug?: string; price?: number }[]) : [];
  const money = (amount: number | null) => (amount != null ? formatMoney(amount, request.currency ?? "USD") : "—");

  return (
    <Drawer
      open
      onClose={onClose}
      title={`Quote request ${request.reference}`}
      size={620}
      destroyOnHidden
      extra={
        canQuote ? (
          <Button type="primary" icon={<FileAddOutlined />} onClick={() => navigate(`/sales/quotations/new?request=${request.id}`)}>
            Create quotation
          </Button>
        ) : null
      }
    >
      <Descriptions column={1} size="small" bordered>
        <Descriptions.Item label="Name">{request.contact_name}</Descriptions.Item>
        <Descriptions.Item label="Email">
          <Typography.Text copyable>{request.contact_email}</Typography.Text>
        </Descriptions.Item>
        {request.company ? <Descriptions.Item label="Company">{request.company}</Descriptions.Item> : null}
        {request.job_title ? <Descriptions.Item label="Role">{request.job_title}</Descriptions.Item> : null}
        {request.phone ? <Descriptions.Item label="Phone">{request.phone}</Descriptions.Item> : null}
        {request.country ? <Descriptions.Item label="Country">{request.country}</Descriptions.Item> : null}
        <Descriptions.Item label="Edition">{request.is_custom ? "Custom licence" : (request.edition_name ?? "—")}</Descriptions.Item>
        <Descriptions.Item label="Licence (list price)">{money(request.licence_total)}</Descriptions.Item>
        <Descriptions.Item label="Maintenance / year">{money(request.maintenance_total)}</Descriptions.Item>
        <Descriptions.Item label="Received">{formatInvoiceDate(request.created_at)}</Descriptions.Item>
      </Descriptions>

      {request.message ? (
        <>
          <Typography.Title level={5} style={{ marginTop: 20 }}>
            Message
          </Typography.Title>
          <Typography.Paragraph style={{ whiteSpace: "pre-wrap" }}>{request.message}</Typography.Paragraph>
        </>
      ) : null}

      <Typography.Title level={5} style={{ marginTop: 20 }}>
        Modules requested ({modules.length})
      </Typography.Title>
      <Flex wrap gap={6}>
        {modules.map((module, index) => (
          <Tag key={module.slug ?? index}>{module.name ?? module.slug}</Tag>
        ))}
      </Flex>

      <Typography.Title level={5} style={{ marginTop: 20 }}>
        Pipeline
      </Typography.Title>
      <Form
        layout="vertical"
        initialValues={{ status: request.status, internal_notes: request.internal_notes ?? "" }}
        onFinish={(values: { status: Status; internal_notes: string }) =>
          run(`save:${request.id}`, async () => {
            const { error } = await supabase.from("quote_requests").update({ status: values.status, internal_notes: values.internal_notes || null }).eq("id", request.id);
            if (error) throw error;
          }, "Saved.").then((ok) => ok && onClose())
        }
      >
        <Form.Item label="Status" name="status">
          <Select options={STATUSES.map((value) => ({ value, label: value }))} />
        </Form.Item>
        <Form.Item label="Internal notes" name="internal_notes" extra="Only the team sees these.">
          <Input.TextArea rows={4} />
        </Form.Item>
        <Button htmlType="submit" loading={busy === `save:${request.id}`}>
          Save
        </Button>
      </Form>
    </Drawer>
  );
}
