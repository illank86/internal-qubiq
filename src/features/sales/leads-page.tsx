import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Col, Descriptions, Drawer, Flex, Form, Input, Popconfirm, Row, Segmented, Select, Table, Tag, Typography } from "antd";
import type { TableColumnsType } from "antd";
import { DeleteOutlined, MailOutlined } from "@ant-design/icons";
import { PageTitle } from "@/components/app-shell";
import type { Database } from "@/lib/database.types";
import { formatInvoiceDate } from "@/lib/invoices";
import { supabase } from "@/lib/supabase";
import { useAction } from "./use-action";

type Lead = Database["public"]["Tables"]["leads"]["Row"];
type Status = Database["public"]["Enums"]["lead_status"];
type LeadType = Database["public"]["Enums"]["lead_type"];

const STATUSES: Status[] = ["new", "contacted", "qualified", "won", "lost", "spam"];
const TYPES: LeadType[] = ["contact", "demo", "trial", "sales", "support", "partner"];
const STATUS_COLOR: Record<Status, string> = { new: "processing", contacted: "default", qualified: "orange", won: "success", lost: "default", spam: "error" };

/** Demo and contact requests from the website's forms. */
export function LeadsPage() {
  const [filter, setFilter] = useState<Status | "all">("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [open, setOpen] = useState<Lead | null>(null);
  const { run, busy } = useAction([["leads"]]);

  const { data, isLoading } = useQuery({
    queryKey: ["leads"],
    queryFn: async () => {
      const { data: rows, error } = await supabase.from("leads").select("*").order("created_at", { ascending: false }).limit(2000);
      if (error) throw error;
      return rows ?? [];
    },
  });

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data ?? []).filter(
      (row) => (filter === "all" || row.status === filter) && (!query || [row.name, row.email, row.company].some((value) => (value ?? "").toLowerCase().includes(query))),
    );
  }, [data, filter, search]);

  const setStatus = (id: string, status: Status) =>
    run(`status:${id}`, async () => {
      const { error } = await supabase.from("leads").update({ status }).eq("id", id);
      if (error) throw error;
    });

  const columns: TableColumnsType<Lead> = [
    {
      title: "Name",
      key: "name",
      render: (_, row) => (
        <Flex vertical>
          <span>{row.name}</span>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {row.email}
          </Typography.Text>
        </Flex>
      ),
    },
    { title: "Company", dataIndex: "company", render: (value: string | null) => value ?? "—", responsive: ["md"] },
    { title: "Type", dataIndex: "type", render: (value: LeadType) => <Tag>{value}</Tag> },
    {
      title: "Message",
      dataIndex: "message",
      render: (value: string | null) => (
        <Typography.Text type="secondary" ellipsis style={{ maxWidth: 280 }}>
          {value ?? ""}
        </Typography.Text>
      ),
      responsive: ["lg"],
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
    { title: "Received", dataIndex: "created_at", render: (value: string) => formatInvoiceDate(value), responsive: ["md"] },
  ];

  return (
    <>
      <PageTitle title="Leads" description="Demo and contact requests submitted from the website." />
      <Flex wrap gap={12} justify="space-between" style={{ marginBottom: 16 }}>
        <Segmented<Status | "all"> value={filter} onChange={setFilter} options={[{ value: "all", label: "All" }, ...STATUSES.map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) }))]} />
        <Flex gap={8}>
          {selected.length > 0 ? (
            <Popconfirm
              title={`Delete ${selected.length} lead${selected.length === 1 ? "" : "s"}?`}
              description="This cannot be undone."
              okText="Delete"
              okButtonProps={{ danger: true }}
              onConfirm={() =>
                run("delete", async () => {
                  const { error } = await supabase.from("leads").delete().in("id", selected);
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
          <Input.Search allowClear placeholder="Search name, email or company" onChange={(event) => setSearch(event.target.value)} style={{ width: 300 }} />
        </Flex>
      </Flex>
      <Table<Lead>
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={rows}
        rowSelection={{ selectedRowKeys: selected, onChange: (keys) => setSelected(keys as string[]) }}
        onRow={(record) => ({ onClick: () => setOpen(record), style: { cursor: "pointer" } })}
        pagination={{ pageSize: 25, hideOnSinglePage: true, showSizeChanger: false }}
        scroll={{ x: 820 }}
        locale={{ emptyText: "No leads yet." }}
      />
      <LeadDrawer lead={open} onClose={() => setOpen(null)} run={run} busy={busy} />
    </>
  );
}

function LeadDrawer({ lead, onClose, run, busy }: { lead: Lead | null; onClose: () => void; run: ReturnType<typeof useAction>["run"]; busy: string | null }) {
  if (!lead) return <Drawer open={false} onClose={onClose} />;
  return (
    <Drawer
      open
      onClose={onClose}
      title={lead.name}
      size={560}
      destroyOnHidden
      extra={
        <Button icon={<MailOutlined />} href={`mailto:${lead.email}`}>
          Email
        </Button>
      }
    >
      <Descriptions column={1} size="small" bordered>
        <Descriptions.Item label="Email">
          <Typography.Text copyable>{lead.email}</Typography.Text>
        </Descriptions.Item>
        {lead.company ? <Descriptions.Item label="Company">{lead.company}</Descriptions.Item> : null}
        {lead.job_title ? <Descriptions.Item label="Job title">{lead.job_title}</Descriptions.Item> : null}
        {lead.phone ? <Descriptions.Item label="Phone">{lead.phone}</Descriptions.Item> : null}
        {lead.country ? <Descriptions.Item label="Country">{lead.country}</Descriptions.Item> : null}
        {lead.industry ? <Descriptions.Item label="Industry">{lead.industry}</Descriptions.Item> : null}
        {lead.company_size ? <Descriptions.Item label="Company size">{lead.company_size}</Descriptions.Item> : null}
        {lead.page_path ? <Descriptions.Item label="Submitted from">{lead.page_path}</Descriptions.Item> : null}
        {lead.plan_slug ? <Descriptions.Item label="Plan of interest">{lead.plan_slug}</Descriptions.Item> : null}
        <Descriptions.Item label="Received">{formatInvoiceDate(lead.created_at)}</Descriptions.Item>
      </Descriptions>
      {lead.message ? (
        <>
          <Typography.Title level={5} style={{ marginTop: 20 }}>
            Message
          </Typography.Title>
          <Typography.Paragraph style={{ whiteSpace: "pre-wrap" }}>{lead.message}</Typography.Paragraph>
        </>
      ) : null}
      <Typography.Title level={5} style={{ marginTop: 20 }}>
        Pipeline
      </Typography.Title>
      <Form
        layout="vertical"
        initialValues={{ status: lead.status, type: lead.type, internal_notes: lead.internal_notes ?? "" }}
        onFinish={(values: { status: Status; type: LeadType; internal_notes: string }) =>
          run(`save:${lead.id}`, async () => {
            const { error } = await supabase.from("leads").update({ status: values.status, type: values.type, internal_notes: values.internal_notes || null }).eq("id", lead.id);
            if (error) throw error;
          }, "Saved.").then((ok) => ok && onClose())
        }
      >
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label="Status" name="status">
              <Select options={STATUSES.map((value) => ({ value, label: value }))} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="Type" name="type">
              <Select options={TYPES.map((value) => ({ value, label: value }))} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item label="Internal notes" name="internal_notes" extra="Only the team sees these.">
          <Input.TextArea rows={4} />
        </Form.Item>
        <Button htmlType="submit" loading={busy === `save:${lead.id}`}>
          Save
        </Button>
      </Form>
    </Drawer>
  );
}
