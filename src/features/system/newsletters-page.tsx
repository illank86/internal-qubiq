import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, App, Button, Card, Checkbox, Descriptions, Drawer, Flex, Form, Popconfirm, Progress, Table, Tag, Typography } from "antd";
import type { TableColumnsType } from "antd";
import { MailOutlined, PlusOutlined, SaveOutlined, SendOutlined } from "@ant-design/icons";
import { useStaff } from "@/auth/use-auth";
import { PageTitle } from "@/components/app-shell";
import type { Database } from "@/lib/database.types";
import { formatInvoiceDate } from "@/lib/invoices";
import { supabase } from "@/lib/supabase";
import { ResourceForm } from "@/features/content/resource-form";
import { fromFormValues, saveRow, toFormValues } from "@/features/content/resource-data";
import { getResource } from "@/features/content/resources";

type Issue = Database["public"]["Tables"]["newsletter_issues"]["Row"];
const resource = getResource("newsletter_issues")!;
const STATUS_COLOR: Record<string, string> = { draft: "default", sending: "processing", sent: "success" };

/**
 * Newsletters: write an issue, send yourself a test, then send it to every
 * active subscriber. Nothing is sent from here — a newsletter_sends row asks
 * the mailer (notify-staff) to send, in resumable batches. The database
 * refuses a second "send to everyone" once an issue has gone out.
 */
export function NewslettersPage() {
  const [editing, setEditing] = useState<Issue | "new" | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["newsletters"],
    refetchInterval: (query) => ((query.state.data as Issue[] | undefined)?.some((issue) => issue.status === "sending") ? 5000 : false),
    queryFn: async () => {
      const { data: rows, error } = await supabase.from("newsletter_issues").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return rows ?? [];
    },
  });

  const columns: TableColumnsType<Issue> = [
    { title: "Issue", dataIndex: "title", render: (title: string) => <Typography.Text strong>{title}</Typography.Text> },
    { title: "Status", dataIndex: "status", render: (status: string) => <Tag color={STATUS_COLOR[status]}>{status}</Tag> },
    {
      title: "Delivered",
      key: "delivered",
      render: (_, issue) =>
        issue.status === "draft" ? (
          <Typography.Text type="secondary">—</Typography.Text>
        ) : (
          `${issue.sent_count ?? 0} of ${issue.recipient_count ?? 0}${issue.failed_count ? ` · ${issue.failed_count} failed` : ""}`
        ),
    },
    { title: "Sent", dataIndex: "sent_at", render: (value: string | null) => (value ? formatInvoiceDate(value) : "—"), responsive: ["md"] },
  ];

  return (
    <>
      <PageTitle
        title="Newsletters"
        description="Release notes and news for subscribers. Write an issue, send yourself a test, then send it to everyone."
        actions={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing("new")}>
            New issue
          </Button>
        }
      />
      <Card>
        <Table<Issue>
          rowKey="id"
          loading={isLoading}
          columns={columns}
          dataSource={data ?? []}
          onRow={(record) => ({ onClick: () => setEditing(record), style: { cursor: "pointer" } })}
          pagination={{ pageSize: 25, hideOnSinglePage: true }}
          locale={{ emptyText: "No newsletters yet." }}
        />
      </Card>
      {editing ? <IssueDrawer issue={editing === "new" ? null : (data ?? []).find((issue) => issue.id === editing.id) ?? editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

function IssueDrawer({ issue, onClose }: { issue: Issue | null; onClose: () => void }) {
  const staff = useStaff();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initial = useMemo(() => toFormValues(resource, issue), [issue]);
  const locked = issue?.status === "sent" || issue?.status === "sending";

  const { data: subscribers } = useQuery({
    queryKey: ["subscriber-count"],
    queryFn: async () => (await supabase.from("newsletter_subscribers").select("id", { count: "exact", head: true }).eq("is_active", true)).count ?? 0,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["newsletters"] });

  const save = async (values: Record<string, unknown>) => {
    const { record, errors } = fromFormValues(resource, values);
    if (errors.length) return form.setFields(errors);
    setBusy("save");
    setError(null);
    try {
      await saveRow(resource, issue?.id ?? null, record);
      await refresh();
      message.success("Saved.");
      if (!issue) onClose();
    } catch (saveError) {
      setError((saveError as { message?: string }).message ?? "It could not be saved.");
    } finally {
      setBusy(null);
    }
  };

  const send = async (mode: "test" | "all") => {
    if (!issue) return;
    setBusy(mode);
    const { error: sendError } = await supabase.from("newsletter_sends").insert({ issue_id: issue.id, mode, requested_by: staff.id });
    setBusy(null);
    if (sendError) return message.error(sendError.code === "42501" ? "This newsletter has already been sent." : "The send could not be started. Please try again.");
    message.success(mode === "test" ? `Test sent to ${staff.email}. It arrives within a minute.` : "Sending has started.");
    setConfirm(false);
    await refresh();
  };

  const total = issue?.recipient_count ?? 0;
  const done = (issue?.sent_count ?? 0) + (issue?.failed_count ?? 0);

  return (
    <Drawer
      open
      onClose={onClose}
      title={issue ? issue.title : "New newsletter"}
      size={960}
      destroyOnHidden
      extra={
        !locked ? (
          <Button type="primary" icon={<SaveOutlined />} loading={busy === "save"} onClick={() => form.submit()}>
            Save
          </Button>
        ) : null
      }
    >
      {issue ? (
        <Card size="small" title={<><MailOutlined /> Send</>} style={{ marginBottom: 16 }}>
          {issue.status === "draft" ? (
            <Flex vertical gap={12}>
              <Flex gap={8} wrap align="center">
                <Button icon={<SendOutlined />} loading={busy === "test"} onClick={() => send("test")}>
                  Send me a test
                </Button>
                <Typography.Text type="secondary">To {staff.email}. Save your changes first.</Typography.Text>
              </Flex>
              <Checkbox checked={confirm} onChange={(event) => setConfirm(event.target.checked)}>
                Send this issue to all {subscribers ?? "…"} active subscribers. It cannot be unsent.
              </Checkbox>
              <div>
                <Popconfirm title={`Send to ${subscribers ?? "all"} subscribers now?`} okText="Send" onConfirm={() => send("all")} disabled={!confirm}>
                  <Button type="primary" icon={<SendOutlined />} disabled={!confirm} loading={busy === "all"}>
                    Send to everyone
                  </Button>
                </Popconfirm>
              </div>
            </Flex>
          ) : (
            <Flex vertical gap={8}>
              <Progress percent={total ? Math.round((done / total) * 100) : 100} status={issue.status === "sending" ? "active" : issue.failed_count ? "exception" : "success"} />
              <Descriptions size="small" column={3}>
                <Descriptions.Item label="Delivered">{issue.sent_count ?? 0}</Descriptions.Item>
                <Descriptions.Item label="Failed">{issue.failed_count ?? 0}</Descriptions.Item>
                <Descriptions.Item label="Recipients">{total}</Descriptions.Item>
              </Descriptions>
              {issue.sent_at ? <Typography.Text type="secondary">Sent {formatInvoiceDate(issue.sent_at)}.</Typography.Text> : <Typography.Text type="secondary">Sending in batches — this updates by itself.</Typography.Text>}
            </Flex>
          )}
        </Card>
      ) : (
        <Alert type="info" showIcon title="Save the issue first; then you can send a test and send it out." style={{ marginBottom: 16 }} />
      )}
      {error ? <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} /> : null}
      {locked ? <Alert type="info" showIcon title="Sent issues are kept as they went out." style={{ marginBottom: 16 }} /> : null}
      <ResourceForm resource={resource} form={form} initialValues={initial} lookups={{}} isNew={!issue} onFinish={save} disabled={locked || busy === "save"} />
    </Drawer>
  );
}
