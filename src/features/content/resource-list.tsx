import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, App, Button, Drawer, Flex, Form, Image, Input, Popconfirm, Result, Skeleton, Space, Table, Tag, Tooltip, Typography } from "antd";
import type { TableColumnsType } from "antd";
import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, PlusOutlined, SaveOutlined } from "@ant-design/icons";
import { useCan } from "@/auth/use-auth";
import { formatInvoiceDate } from "@/lib/invoices";
import { formatBytes } from "@/lib/media";
import { errorText } from "@/lib/sales";
import { formatDuration } from "./media";
import { ResourceForm } from "./resource-form";
import { deleteRows, fetchLookups, fetchRows, fetchSingleton, fromFormValues, moveRow, saveRow, toFormValues, type Row } from "./resource-data";
import type { ListColumn, Resource } from "./resources";
import type { Lookups } from "./field-input";
import { siteAsset } from "@/lib/env";

/** Any list of a content table: search, order, open to edit, add, delete. */
export function ResourceList({ resource }: { resource: Resource }) {
  const can = useCan();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const writable = can(resource.permission) && !resource.readOnly;

  const rows = useQuery({ queryKey: ["resource", resource.key], queryFn: () => fetchRows(resource) });
  const lookups = useQuery({ queryKey: ["lookups", resource.key], queryFn: () => fetchLookups(resource) });
  const labelOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const options of Object.values(lookups.data ?? {})) for (const option of options) map.set(option.value, option.label);
    return map;
  }, [lookups.data]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["resource", resource.key] });
  const act = async (key: string, work: () => Promise<unknown>, success?: string) => {
    setBusy(key);
    try {
      await work();
      if (success) message.success(success);
      await refresh();
    } catch (error) {
      console.error(error);
      message.error(errorText(error as { code?: string }, (error as { message?: string }).message ?? "That did not work."));
    } finally {
      setBusy(null);
    }
  };

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    let list = rows.data ?? [];
    if (query) {
      const columns = [resource.searchColumn, ...resource.listColumns.map((column) => column.name)].filter(Boolean) as string[];
      list = list.filter((row) => columns.some((column) => String(row[column] ?? "").toLowerCase().includes(query)));
    }
    if (resource.groupBy) {
      const key = resource.groupBy;
      list = [...list].sort((a, b) => String(labelOf.get(String(a[key])) ?? a[key] ?? "").localeCompare(String(labelOf.get(String(b[key])) ?? b[key] ?? "")));
    }
    return list;
  }, [rows.data, search, resource, labelOf]);

  const render = (column: ListColumn, value: unknown) => {
    if (value == null || value === "") return <Typography.Text type="secondary">—</Typography.Text>;
    const looked = labelOf.get(String(value));
    switch (column.type) {
      case "boolean":
        return value ? <Tag color="success">Yes</Tag> : <Tag>No</Tag>;
      case "badge":
        return <Tag>{looked ?? String(value)}</Tag>;
      case "number":
        return Number(value).toLocaleString("en-US");
      case "bytes":
        return formatBytes(Number(value));
      case "date":
        return formatInvoiceDate(String(value));
      case "duration":
        return formatDuration(Number(value));
      case "image":
        return <Image src={siteAsset(String(value))} width={56} height={40} style={{ objectFit: "cover", borderRadius: 4 }} preview={false} />;
      default:
        return <Typography.Text ellipsis style={{ maxWidth: 320 }}>{looked ?? String(value)}</Typography.Text>;
    }
  };

  const columns: TableColumnsType<Row> = [
    ...(resource.groupBy
      ? [{ title: resource.fields.find((field) => field.name === resource.groupBy)?.label ?? "Group", key: "__group", render: (_: unknown, row: Row) => <Tag>{labelOf.get(String(row[resource.groupBy!])) ?? String(row[resource.groupBy!] ?? "—")}</Tag> }]
      : []),
    ...resource.listColumns.map((column) => ({
      title: column.label,
      key: column.name,
      align: column.type === "number" ? ("right" as const) : undefined,
      render: (_: unknown, row: Row) => render(column, row[column.name]),
    })),
    ...(writable
      ? [
          {
            title: <span className="sr-only">Actions</span>,
            key: "__actions",
            align: "right" as const,
            render: (_: unknown, row: Row) => (
              <Space size={2} onClick={(event) => event.stopPropagation()}>
                {resource.orderColumn ? (
                  <>
                    <Tooltip title="Move up">
                      <Button size="small" type="text" icon={<ArrowUpOutlined />} loading={busy === `up:${row.id}`} onClick={() => act(`up:${row.id}`, () => moveRow(resource, rows.data ?? [], row, -1))} aria-label="Move up" />
                    </Tooltip>
                    <Tooltip title="Move down">
                      <Button size="small" type="text" icon={<ArrowDownOutlined />} loading={busy === `down:${row.id}`} onClick={() => act(`down:${row.id}`, () => moveRow(resource, rows.data ?? [], row, 1))} aria-label="Move down" />
                    </Tooltip>
                  </>
                ) : null}
                <Popconfirm title={`Delete this ${resource.singular.toLowerCase()}?`} okText="Delete" okButtonProps={{ danger: true }} onConfirm={() => act(`del:${row.id}`, () => deleteRows(resource, [String(row.id)]), "Deleted.")}>
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} loading={busy === `del:${row.id}`} aria-label="Delete" />
                </Popconfirm>
              </Space>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <Flex justify="space-between" gap={12} wrap style={{ marginBottom: 12 }}>
        <Typography.Paragraph type="secondary" style={{ margin: 0, maxWidth: 720 }}>
          {resource.description}
        </Typography.Paragraph>
        <Flex gap={8}>
          {selected.length > 0 && resource.bulkDelete ? (
            <Popconfirm title={`Delete ${selected.length}?`} okText="Delete" okButtonProps={{ danger: true }} onConfirm={() => act("bulk", async () => { await deleteRows(resource, selected); setSelected([]); }, "Deleted.")}>
              <Button danger icon={<DeleteOutlined />} loading={busy === "bulk"}>
                Delete {selected.length}
              </Button>
            </Popconfirm>
          ) : null}
          <Input.Search allowClear placeholder="Search" onChange={(event) => setSearch(event.target.value)} style={{ width: 220 }} />
          {writable && !resource.noCreate ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing("new")}>
              New {resource.singular.toLowerCase()}
            </Button>
          ) : null}
        </Flex>
      </Flex>
      {rows.error ? <Alert type="error" showIcon title="This list could not be loaded." style={{ marginBottom: 12 }} /> : null}
      <Table<Row>
        rowKey={(row) => String(row.id)}
        size="small"
        loading={rows.isLoading}
        columns={columns}
        dataSource={filtered}
        rowSelection={resource.bulkDelete && writable ? { selectedRowKeys: selected, onChange: (keys) => setSelected(keys as string[]) } : undefined}
        onRow={(record) => ({ onClick: () => setEditing(record), style: { cursor: "pointer" } })}
        pagination={{ pageSize: 50, hideOnSinglePage: true, showSizeChanger: false }}
        scroll={{ x: 640 }}
      />
      {editing ? <EditDrawer resource={resource} row={editing === "new" ? null : editing} lookups={lookups.data ?? {}} writable={writable} onClose={() => setEditing(null)} onSaved={refresh} /> : null}
    </>
  );
}

function EditDrawer({ resource, row, lookups, writable, onClose, onSaved }: { resource: Resource; row: Row | null; lookups: Lookups; writable: boolean; onClose: () => void; onSaved: () => void }) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initial = useMemo(() => toFormValues(resource, row), [resource, row]);
  const title = row ? String(row.title ?? row.name ?? row.label ?? row.question ?? row.company_name ?? resource.singular) : `New ${resource.singular.toLowerCase()}`;

  const save = async (values: Record<string, unknown>) => {
    const { record, errors } = fromFormValues(resource, values);
    if (errors.length) return form.setFields(errors);
    setPending(true);
    setError(null);
    try {
      await saveRow(resource, row ? String(row.id) : null, record);
      message.success(row ? "Saved. The website shows it now." : `${resource.singular} created.`);
      onSaved();
      onClose();
    } catch (saveError) {
      setError((saveError as { message?: string }).message ?? "That could not be saved.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={title}
      size={resource.fields.some((field) => field.type === "markdown") ? 960 : 720}
      destroyOnHidden
      extra={
        writable ? (
          <Button type="primary" icon={<SaveOutlined />} loading={pending} onClick={() => form.submit()}>
            Save
          </Button>
        ) : null
      }
    >
      {error ? <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} /> : null}
      <ResourceForm resource={resource} form={form} initialValues={initial} lookups={lookups} isNew={!row} onFinish={save} disabled={!writable || pending} />
    </Drawer>
  );
}

/** A single-row resource (Site settings): the form, with a Save button. */
export function SingletonForm({ resource }: { resource: Resource }) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const can = useCan();
  const row = useQuery({ queryKey: ["resource", resource.key], queryFn: () => fetchSingleton(resource) });
  const lookups = useQuery({ queryKey: ["lookups", resource.key], queryFn: () => fetchLookups(resource) });

  if (row.isLoading || lookups.isLoading) return <Skeleton active paragraph={{ rows: 10 }} />;
  if (!row.data) return <Result status="warning" title={`${resource.label} could not be loaded.`} />;

  const save = async (values: Record<string, unknown>) => {
    const { record, errors } = fromFormValues(resource, values);
    if (errors.length) return form.setFields(errors);
    setPending(true);
    setError(null);
    try {
      await saveRow(resource, null, record);
      await queryClient.invalidateQueries({ queryKey: ["resource", resource.key] });
      message.success("Saved. The website shows it now.");
    } catch (saveError) {
      setError((saveError as { message?: string }).message ?? "That could not be saved.");
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Flex justify="space-between" gap={12} style={{ marginBottom: 16 }}>
        <Typography.Paragraph type="secondary" style={{ margin: 0, maxWidth: 720 }}>
          {resource.description}
        </Typography.Paragraph>
        {can(resource.permission) ? (
          <Button type="primary" icon={<SaveOutlined />} loading={pending} onClick={() => form.submit()}>
            Save
          </Button>
        ) : null}
      </Flex>
      {error ? <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} /> : null}
      <ResourceForm resource={resource} form={form} initialValues={toFormValues(resource, row.data)} lookups={lookups.data ?? {}} isNew={false} onFinish={save} disabled={pending || !can(resource.permission)} />
    </>
  );
}
