import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Avatar, Button, Checkbox, Col, Descriptions, Divider, Drawer, Empty, Flex, Form, Image, Input, Row, Segmented, Select, Table, Tag, Typography } from "antd";
import type { TableColumnsType } from "antd";
import { LockOutlined, SendOutlined } from "@ant-design/icons";
import { useStaff } from "@/auth/use-auth";
import { PageTitle } from "@/components/app-shell";
import type { Database } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";
import { MarkdownView } from "@/features/content/markdown-view";
import { useAction } from "@/features/sales/use-action";

type Report = Database["public"]["Tables"]["bug_reports"]["Row"];
type Status = Database["public"]["Enums"]["bug_status"];
type Severity = Database["public"]["Enums"]["bug_severity"];
type Message = Database["public"]["Tables"]["bug_report_messages"]["Row"] & { author: { full_name: string | null; user_type: string } | null };
type Attachment = { path: string; name: string; type: string; size: number };

const STATUSES: Status[] = ["new", "triaged", "confirmed", "in_progress", "fixed", "wont_fix", "duplicate", "cannot_reproduce"];
const CLOSED: Status[] = ["fixed", "wont_fix", "duplicate", "cannot_reproduce"];
const SEVERITY_COLOR: Record<Severity, string> = { low: "default", medium: "blue", high: "orange", critical: "red" };
const STATUS_COLOR: Partial<Record<Status, string>> = { new: "processing", confirmed: "orange", in_progress: "gold", fixed: "success" };
const label = (status: string) => status.replace(/_/g, " ");
const when = (value: string) => new Date(value).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Changing status to a closed one stamps resolved_at; the reporter is emailed by the database. */
async function setStatus(id: string, status: Status) {
  const { error } = await supabase
    .from("bug_reports")
    .update({ status, resolved_at: CLOSED.includes(status) ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw error;
}

/**
 * Reports filed by customers at /support. Open one to triage it and reply —
 * the reporter sees replies against their reference and is emailed; internal
 * notes stay with the team.
 */
export function BugReportsPage() {
  const [filter, setFilter] = useState<"open" | "closed" | "all">("open");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const { run, busy } = useAction([["bug-reports"]]);

  const { data, isLoading } = useQuery({
    queryKey: ["bug-reports"],
    queryFn: async () => {
      const { data: rows, error } = await supabase.from("bug_reports").select("*").order("last_activity_at", { ascending: false }).limit(1000);
      if (error) throw error;
      return rows ?? [];
    },
  });

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data ?? []).filter(
      (row) =>
        (filter === "all" || (filter === "closed") === CLOSED.includes(row.status)) &&
        (!query || [row.reference, row.title, row.reporter_name, row.reporter_email].some((value) => (value ?? "").toLowerCase().includes(query))),
    );
  }, [data, filter, search]);

  const columns: TableColumnsType<Report> = [
    { title: "Ref", dataIndex: "reference", render: (value: string) => <Typography.Text style={{ fontFamily: "Geist Mono, monospace", fontSize: 13 }}>{value}</Typography.Text> },
    {
      title: "Report",
      key: "title",
      render: (_, row) => (
        <Flex vertical>
          <Typography.Text strong>{row.title}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {row.reporter_name ?? "—"}
            {row.area ? ` · ${row.area}` : ""}
          </Typography.Text>
        </Flex>
      ),
    },
    { title: "Severity", dataIndex: "severity", render: (value: Severity) => <Tag color={SEVERITY_COLOR[value]}>{value}</Tag> },
    {
      title: "Status",
      dataIndex: "status",
      render: (status: Status, row) => (
        <Select<Status>
          size="small"
          value={status}
          variant="borderless"
          loading={busy === `status:${row.id}`}
          onClick={(event) => event.stopPropagation()}
          onChange={(value) => run(`status:${row.id}`, () => setStatus(row.id, value))}
          options={STATUSES.map((value) => ({ value, label: <Tag color={STATUS_COLOR[value]}>{label(value)}</Tag> }))}
          style={{ width: 170 }}
        />
      ),
    },
    { title: "Last activity", dataIndex: "last_activity_at", render: (value: string) => when(value), responsive: ["md"] },
  ];

  return (
    <>
      <PageTitle title="Bug reports" description="Reports filed by customers at /support. Open one to triage it and reply — the reporter sees your replies against their reference." />
      <Flex wrap gap={12} justify="space-between" style={{ marginBottom: 16 }}>
        <Segmented
          value={filter}
          onChange={(value) => setFilter(value as typeof filter)}
          options={[
            { value: "open", label: "Open" },
            { value: "closed", label: "Closed" },
            { value: "all", label: "All" },
          ]}
        />
        <Input.Search allowClear placeholder="Search reference, title or reporter" onChange={(event) => setSearch(event.target.value)} style={{ maxWidth: 320 }} />
      </Flex>
      <Table<Report>
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={rows}
        onRow={(record) => ({ onClick: () => setOpenId(record.id), style: { cursor: "pointer" } })}
        pagination={{ pageSize: 25, hideOnSinglePage: true, showSizeChanger: false }}
        scroll={{ x: 760 }}
        locale={{ emptyText: filter === "open" ? "Nothing open." : "No reports." }}
      />
      {openId ? <ReportDrawer id={openId} onClose={() => setOpenId(null)} /> : null}
    </>
  );
}

function ReportDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const staff = useStaff();
  const [form] = Form.useForm();
  const [reply] = Form.useForm<{ body: string; internal: boolean }>();
  const { run, busy } = useAction([["bug-reports"], ["bug-report", id]]);

  const { data } = useQuery({
    queryKey: ["bug-report", id],
    queryFn: async () => {
      const [{ data: report, error }, { data: messages }, { data: team }] = await Promise.all([
        supabase.from("bug_reports").select("*").eq("id", id).maybeSingle(),
        supabase.from("bug_report_messages").select("*, author:profiles(full_name, user_type)").eq("report_id", id).order("created_at"),
        supabase.from("profiles").select("id, full_name, email").eq("user_type", "internal").order("full_name"),
      ]);
      if (error) throw error;
      const files = (Array.isArray(report?.attachments) ? report.attachments : []) as unknown as Attachment[];
      const { data: signed } = files.length ? await supabase.storage.from("bug-attachments").createSignedUrls(files.map((file) => file.path), 1800) : { data: [] };
      const urls = new Map((signed ?? []).map((entry) => [entry.path, entry.signedUrl]));
      return { report, messages: (messages ?? []) as unknown as Message[], team: team ?? [], files: files.map((file) => ({ ...file, url: urls.get(file.path) })) };
    },
  });

  const report = data?.report;
  return (
    <Drawer open onClose={onClose} title={report ? `${report.reference} · ${report.title}` : "Bug report"} size={760} destroyOnHidden loading={!report}>
      {report ? (
        <>
          <Flex gap={8} wrap style={{ marginBottom: 16 }}>
            <Tag color={SEVERITY_COLOR[report.severity]}>{report.severity}</Tag>
            <Tag color={STATUS_COLOR[report.status]}>{label(report.status)}</Tag>
            {report.allow_contact ? <Tag>May be contacted</Tag> : <Tag>No contact</Tag>}
          </Flex>
          <Typography.Title level={5}>What happened</Typography.Title>
          <div style={{ marginBottom: 16 }}>
            <MarkdownView markdown={report.description} />
          </div>
          {report.steps_to_reproduce ? (
            <>
              <Typography.Title level={5}>Steps to reproduce</Typography.Title>
              <div style={{ marginBottom: 16 }}>
                <MarkdownView markdown={report.steps_to_reproduce} />
              </div>
            </>
          ) : null}
          {report.expected_result || report.actual_result ? (
            <Descriptions column={1} size="small" bordered style={{ marginBottom: 16 }}>
              {report.expected_result ? <Descriptions.Item label="Expected">{report.expected_result}</Descriptions.Item> : null}
              {report.actual_result ? <Descriptions.Item label="Actual">{report.actual_result}</Descriptions.Item> : null}
            </Descriptions>
          ) : null}
          {data.files.length > 0 ? (
            <>
              <Typography.Title level={5}>Screenshots</Typography.Title>
              <Image.PreviewGroup>
                <Flex gap={8} wrap style={{ marginBottom: 16 }}>
                  {data.files.map((file) => (file.url ? <Image key={file.path} src={file.url} alt={file.name} width={160} height={100} style={{ objectFit: "cover", borderRadius: 8 }} /> : null))}
                </Flex>
              </Image.PreviewGroup>
            </>
          ) : null}
          <Descriptions column={{ xs: 1, sm: 2 }} size="small" bordered>
            <Descriptions.Item label="Reporter">{report.reporter_name ?? "—"}</Descriptions.Item>
            <Descriptions.Item label="Email">{report.reporter_email ? <Typography.Text copyable>{report.reporter_email}</Typography.Text> : "—"}</Descriptions.Item>
            <Descriptions.Item label="Version">{report.product_version ?? "—"}</Descriptions.Item>
            <Descriptions.Item label="Environment">{report.environment ?? "—"}</Descriptions.Item>
            <Descriptions.Item label="Browser">{report.browser ?? "—"}</Descriptions.Item>
            <Descriptions.Item label="Filed">{when(report.created_at)}</Descriptions.Item>
          </Descriptions>

          <Divider titlePlacement="start">Triage</Divider>
          <Form
            form={form}
            layout="vertical"
            initialValues={{ severity: report.severity, status: report.status, area: report.area ?? "", assigned_to: report.assigned_to, internal_notes: report.internal_notes ?? "" }}
            onFinish={(values: { severity: Severity; status: Status; area: string; assigned_to: string | null; internal_notes: string }) =>
              run("triage", async () => {
                const { error } = await supabase
                  .from("bug_reports")
                  .update({
                    severity: values.severity,
                    status: values.status,
                    area: values.area || null,
                    assigned_to: values.assigned_to ?? null,
                    internal_notes: values.internal_notes || null,
                    resolved_at: CLOSED.includes(values.status) ? (report.resolved_at ?? new Date().toISOString()) : null,
                  })
                  .eq("id", report.id);
                if (error) throw error;
              }, "Saved.")
            }
          >
            <Row gutter={16}>
              <Col xs={24} sm={12}>
                <Form.Item label="Severity" name="severity">
                  <Select options={(["low", "medium", "high", "critical"] as Severity[]).map((value) => ({ value, label: value }))} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item label="Status" name="status" extra="Fixed and closed statuses email the reporter.">
                  <Select options={STATUSES.map((value) => ({ value, label: label(value) }))} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item label="Area" name="area">
                  <Input />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item label="Assigned to" name="assigned_to">
                  <Select allowClear options={data.team.map((person) => ({ value: person.id, label: person.full_name || person.email }))} />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item label="Internal notes" name="internal_notes">
              <Input.TextArea rows={3} />
            </Form.Item>
            <Button htmlType="submit" loading={busy === "triage"}>
              Save triage
            </Button>
          </Form>

          <Divider titlePlacement="start">Conversation</Divider>
          {data.messages.length === 0 ? <Empty description="No replies yet." image={Empty.PRESENTED_IMAGE_SIMPLE} /> : null}
          <Flex vertical gap={12} style={{ marginBottom: 16 }}>
            {data.messages.map((message) => {
              const fromStaff = message.author?.user_type === "internal";
              return (
                <Flex key={message.id} gap={10} align="flex-start">
                  <Avatar style={{ flexShrink: 0, background: fromStaff ? "var(--ant-color-primary)" : undefined }}>{(message.author?.full_name ?? "?")[0]}</Avatar>
                  <div style={{ flex: 1, minWidth: 0, padding: "8px 12px", borderRadius: 8, background: message.is_internal ? "rgba(250, 173, 20, 0.12)" : "rgba(127,127,127,0.08)" }}>
                    <Flex justify="space-between" gap={8} wrap>
                      <Typography.Text strong>
                        {message.author?.full_name ?? "Reporter"}
                        {message.is_internal ? (
                          <Tag icon={<LockOutlined />} color="gold" style={{ marginLeft: 8 }}>
                            Internal note
                          </Tag>
                        ) : null}
                      </Typography.Text>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {when(message.created_at)}
                      </Typography.Text>
                    </Flex>
                    <Typography.Paragraph style={{ whiteSpace: "pre-wrap", margin: "4px 0 0" }}>{message.body}</Typography.Paragraph>
                  </div>
                </Flex>
              );
            })}
          </Flex>
          {!report.allow_contact ? <Alert type="info" showIcon title="The reporter asked not to be contacted: replies show on their report page but are not emailed." style={{ marginBottom: 12 }} /> : null}
          <Form
            form={reply}
            initialValues={{ body: "", internal: false }}
            onFinish={(values) =>
              run("reply", async () => {
                const { error } = await supabase.from("bug_report_messages").insert({ report_id: report.id, author_id: staff.id, body: values.body.trim(), is_internal: values.internal });
                if (error) throw error;
                reply.resetFields();
              }, values.internal ? "Note added." : "Reply sent.")
            }
          >
            <Form.Item name="body" rules={[{ required: true, whitespace: true, message: "Write a reply" }]} style={{ marginBottom: 8 }}>
              <Input.TextArea rows={4} placeholder="Write a reply to the reporter, or an internal note" />
            </Form.Item>
            <Flex justify="space-between" align="center">
              <Form.Item name="internal" valuePropName="checked" style={{ margin: 0 }}>
                <Checkbox>Internal note (only the team sees it)</Checkbox>
              </Form.Item>
              <Button type="primary" htmlType="submit" icon={<SendOutlined />} loading={busy === "reply"}>
                Post
              </Button>
            </Flex>
          </Form>
        </>
      ) : null}
    </Drawer>
  );
}
