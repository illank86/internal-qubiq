import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Alert, App, Button, Checkbox, Col, Drawer, Dropdown, Empty, Flex, Form, Input, Modal, Popconfirm, Row, Segmented, Table, Tabs, Tag, Typography, Upload, theme } from "antd";
import type { MenuProps, TableColumnsType } from "antd";
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  FilePdfOutlined,
  FileTextOutlined,
  InboxOutlined,
  LinkOutlined,
  MoreOutlined,
  ProfileOutlined,
  SendOutlined,
  StopOutlined,
  TeamOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { PageTitle } from "@/components/app-shell";
import { usePdfViewer } from "@/components/pdf-viewer-context";
import { env } from "@/lib/env";
import { formatInvoiceDate } from "@/lib/invoices";
import { supabase } from "@/lib/supabase";
import { invoicePdf } from "./api";
import { DocumentHistory } from "./document-history";
import { InfoSection, StandingPanel, StatRow } from "./drawer-parts";
import { DeliveryOrderEditor } from "./delivery-order-editor";
import {
  FILE_KIND_LABEL,
  METHOD_LABEL,
  STATUS_LABEL,
  attachDeliveryFile,
  cancelDeliveryOrder,
  deliveryFileRequest,
  deliveryOrderPdf,
  issueDeliveryOrder,
  licenceIssued,
  removeDeliveryFile,
  updateDeliverySigners,
  type DeliveryFile,
  type DeliveryItem,
  type DeliveryMethod,
  type DeliveryOrder,
  type DeliverySigners,
  type DeliveryStatus,
  type FileKind,
} from "./delivery-api";
import { useAction } from "./use-action";
import { DateInput } from "@/components/date-input";

export type DeliveryRow = DeliveryOrder & { items: Pick<DeliveryItem, "id" | "description" | "detail" | "quantity" | "unit" | "position">[]; files: DeliveryFile[] };
type Filter = "all" | DeliveryStatus;
type Run = ReturnType<typeof useAction>["run"];

const SELECT = "*, items:delivery_order_items(id, description, detail, quantity, unit, position), files:delivery_order_files(*)";
const INVALIDATE = [["delivery-orders"], ["invoice-deliveries"], ["history"], ["order-overview"]];
const servers = (row: Pick<DeliveryRow, "items">) => row.items.reduce((sum, item) => sum + Number(item.quantity), 0);
const todayIso = () => new Date().toISOString().slice(0, 10);
const mono = { fontFamily: "Geist Mono, monospace", fontSize: 13, whiteSpace: "nowrap" } as const;

export function DeliveryStatusTag({ row }: { row: Pick<DeliveryOrder, "status" | "received_via"> }) {
  const status = STATUS_LABEL[row.status as DeliveryStatus] ?? { label: row.status, color: "default" };
  return (
    <Tag color={status.color} style={{ marginInlineEnd: 0 }}>
      {status.label}
      {row.status === "received" && row.received_via ? (row.received_via === "online" ? " · online" : " · signed copy") : ""}
    </Tag>
  );
}

/** Which received documents it has: "Signed DO", "BAST". */
function FileTags({ files }: { files: DeliveryFile[] }) {
  const kinds = [...new Set(files.map((file) => file.kind as FileKind))];
  return kinds.map((kind) => (
    <Tag key={kind} icon={<CheckCircleOutlined />} color={kind === "other" ? "default" : "success"} style={{ marginInlineEnd: 0 }}>
      {FILE_KIND_LABEL[kind]}
    </Tag>
  ));
}

/**
 * Delivery orders: what was handed over for a paid invoice, to whom, and the
 * proof it arrived — confirmed online, or the signed DO and BAST uploaded.
 */
export function DeliveryOrdersPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [params, setParams] = useSearchParams();
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ invoiceId?: string; order?: DeliveryOrder } | null>(null);
  const { run, busy } = useAction(INVALIDATE);

  const { data, isLoading, error } = useQuery({
    queryKey: ["delivery-orders"],
    queryFn: async () => {
      const { data: rows, error: loadError } = await supabase.from("delivery_orders").select(SELECT).order("created_at", { ascending: false }).limit(1000);
      if (loadError) throw loadError;
      return (rows ?? []) as unknown as DeliveryRow[];
    },
  });

  // From an invoice: ?new=<invoice id> starts one, ?do=<id> opens one.
  const fromInvoice = params.get("new");
  const linked = params.get("do");
  useEffect(() => {
    if (!fromInvoice && !linked) return;
    if (fromInvoice) setEditing({ invoiceId: fromInvoice });
    if (linked) setOpenId(linked);
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("new");
        next.delete("do");
        return next;
      },
      { replace: true },
    );
  }, [fromInvoice, linked, setParams]);

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data ?? []).filter((row) => {
      if (filter !== "all" && row.status !== filter) return false;
      if (!query) return true;
      return [row.number, row.invoice_number, row.po_number, row.quotation_number, row.ship_to_name, row.ship_to_company].some((value) => (value ?? "").toLowerCase().includes(query));
    });
  }, [data, filter, search]);
  const waiting = (data ?? []).filter((row) => row.status === "issued").length;

  const columns: TableColumnsType<DeliveryRow> = [
    {
      title: "Delivery order",
      key: "number",
      width: 170,
      render: (_, row) => (
        <Flex vertical>
          <Typography.Text style={mono}>{row.number}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
            {row.invoice_number}
          </Typography.Text>
          {row.po_number ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {row.po_number}
            </Typography.Text>
          ) : null}
        </Flex>
      ),
    },
    {
      title: "Deliver to",
      key: "to",
      render: (_, row) => (
        <Flex vertical>
          <span>{row.ship_to_name}</span>
          {row.ship_to_company && row.ship_to_company !== row.ship_to_name ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {row.ship_to_company}
            </Typography.Text>
          ) : null}
        </Flex>
      ),
    },
    {
      title: "Delivery",
      key: "delivery",
      responsive: ["md"],
      render: (_, row) => (
        <Flex vertical>
          <span>{METHOD_LABEL[row.method as DeliveryMethod] ?? row.method}</span>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {row.delivery_date ? formatInvoiceDate(row.delivery_date) : "No date yet"}
          </Typography.Text>
        </Flex>
      ),
    },
    { title: "Servers", key: "servers", align: "right", responsive: ["lg"], render: (_, row) => servers(row) },
    {
      title: "Status",
      key: "status",
      render: (_, row) => (
        <Flex vertical gap={2} align="flex-start">
          <DeliveryStatusTag row={row} />
          <FileTags files={row.files} />
        </Flex>
      ),
    },
    {
      title: <span className="sr-only">Actions</span>,
      key: "actions",
      align: "right",
      render: (_, row) => <DeliveryRowActions row={row} run={run} busy={busy} onOpen={() => setOpenId(row.id)} onEdit={() => setEditing({ order: row })} />,
    },
  ];

  return (
    <>
      <PageTitle
        title="Delivery Order"
        description={`${waiting ? `${waiting} awaiting receipt. ` : ""}Made from a paid invoice whose licences are issued — Create delivery order in Order overview. The customer confirms receipt online, or you upload the signed DO and BAST.`}
      />
      {error ? <Alert type="error" showIcon title="The delivery orders could not be loaded. Please reload the page." style={{ marginBottom: 16 }} /> : null}
      <Flex wrap gap={12} justify="space-between" style={{ marginBottom: 16 }}>
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "draft", label: "Draft" },
            { value: "issued", label: "Awaiting receipt" },
            { value: "received", label: "Received" },
            { value: "cancelled", label: "Cancelled" },
          ]}
        />
        <Input.Search allowClear value={search} placeholder="Search DO, invoice, PO or customer" onChange={(event) => setSearch(event.target.value)} style={{ maxWidth: 320 }} />
      </Flex>
      <Table<DeliveryRow>
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={rows}
        pagination={{ pageSize: 25, hideOnSinglePage: true, showSizeChanger: false }}
        scroll={{ x: 760 }}
        locale={{ emptyText: data && data.length > 0 ? "Nothing matches." : "No delivery orders yet." }}
        onRow={(row) => ({ onClick: () => setOpenId(row.id), style: { cursor: "pointer" } })}
      />
      <DeliveryOrderDrawer
        key={openId ?? "closed"}
        row={(openId && data?.find((row) => row.id === openId)) || null}
        onClose={() => setOpenId(null)}
        onEdit={(order) => setEditing({ order })}
        run={run}
        busy={busy}
      />
      <DeliveryOrderEditor
        key={editing ? (editing.order?.id ?? editing.invoiceId) : "closed"}
        open={Boolean(editing)}
        invoiceId={editing?.invoiceId}
        order={editing?.order}
        onClose={() => setEditing(null)}
        onSaved={(id) => setOpenId(id)}
      />
    </>
  );
}

/** Issue (or send again) from the PDF preview, so it is checked first. */
function useIssue(row: DeliveryRow, run: Run) {
  const viewPdf = usePdfViewer();
  const again = row.status !== "draft";
  return () =>
    viewPdf({
      ...deliveryOrderPdf(row),
      note: again ? "Sends it again with the confirm-receipt link." : "Check it. Issuing gives it its signature and emails it with a link to confirm receipt.",
      recipients: row.contact_email ? { to: row.contact_email, cc: row.cc_emails } : undefined,
      action: {
        label: again ? "Send again" : "Issue & send",
        onClick: async () => {
          await run(`issue:${row.id}`, () => issueDeliveryOrder(row.id), again ? "Sent again." : `Issued and emailed to ${row.contact_email}.`);
        },
      },
    });
}

function DeliveryRowActions({ row, run, busy, onOpen, onEdit }: { row: DeliveryRow; run: Run; busy: string | null; onOpen: () => void; onEdit: () => void }) {
  const viewPdf = usePdfViewer();
  const { message } = App.useApp();
  const [uploading, setUploading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [signers, setSigners] = useState(false);
  const issue = useIssue(row, run);
  type Item = { key: string; icon: React.ReactNode; label: string; onClick: () => unknown; danger?: boolean };

  const next: Item[] = [];
  if (row.status === "draft") {
    next.push({ key: "issue", icon: <SendOutlined />, label: "Review & issue", onClick: issue });
    next.push({ key: "edit", icon: <EditOutlined />, label: "Edit draft", onClick: onEdit });
  } else if (row.status === "issued") {
    next.push({ key: "upload", icon: <UploadOutlined />, label: "Upload signed DO / BAST", onClick: () => setUploading(true) });
  }
  const view: Item[] = [
    { key: "details", icon: <ProfileOutlined />, label: "Details & history", onClick: onOpen },
    { key: "pdf", icon: <FilePdfOutlined />, label: "View PDF", onClick: () => viewPdf(deliveryOrderPdf(row)) },
    ...row.files.map((file) => ({ key: `file-${file.id}`, icon: <EyeOutlined />, label: `View ${FILE_KIND_LABEL[file.kind as FileKind] ?? "file"}`, onClick: () => viewPdf(deliveryFileRequest(file, row.number)) })),
    { key: "invoice", icon: <FileTextOutlined />, label: `Invoice ${row.invoice_number ?? ""}`.trim(), onClick: () => viewPdf(invoicePdf(row.invoice_id, row.invoice_number)) },
  ];
  const change: Item[] = [];
  // Only while waiting for receipt: once received (online or by an uploaded signed DO / BAST) the link has done its job.
  if (row.status === "issued") {
    change.push({ key: "signers", icon: <TeamOutlined />, label: "Edit names & positions", onClick: () => setSigners(true) });
    change.push({ key: "again", icon: <SendOutlined />, label: "Send again", onClick: issue });
    change.push({
      key: "link",
      icon: <LinkOutlined />,
      label: "Copy customer link",
      onClick: () => navigator.clipboard.writeText(`${env.siteUrl}/do/${row.public_token}`).then(() => message.success("Link copied.")),
    });
  }
  if (row.status === "received") change.push({ key: "upload", icon: <UploadOutlined />, label: "Upload signed DO / BAST", onClick: () => setUploading(true) });

  const group = (label: string, items: Item[]) => (items.length ? [{ type: "group" as const, label, children: items }] : []);
  const menu: MenuProps["items"] = [
    ...group("Next step", next),
    ...group("View", view),
    ...group("Change", change),
    ...(row.status === "draft" || row.status === "issued"
      ? [{ type: "divider" as const }, { key: "cancel", icon: <StopOutlined />, label: "Cancel delivery order…", danger: true, onClick: () => setCancelling(true) }]
      : []),
  ];

  return (
    <Flex justify="flex-end" onClick={(event) => event.stopPropagation()}>
      <Dropdown menu={{ items: menu }} trigger={["click"]} placement="bottomRight">
        <Button
          size="small"
          type={next.length ? "default" : "text"}
          icon={<MoreOutlined />}
          loading={Boolean(busy?.endsWith(`:${row.id}`))}
          aria-label={`Actions for ${row.number ?? "this delivery order"}`}
          style={next.length ? { borderColor: "var(--ant-color-primary)", color: "var(--ant-color-primary)" } : undefined}
        />
      </Dropdown>
      <UploadReceivedModal row={row} open={uploading} onClose={() => setUploading(false)} run={run} />
      <CancelModal row={row} open={cancelling} onClose={() => setCancelling(false)} run={run} />
      <SignersModal row={row} open={signers} onClose={() => setSigners(false)} run={run} />
    </Flex>
  );
}

type UploadValues = { kind: FileKind; received_name: string; received_title: string; received_on: string };

/**
 * What the customer signed: the delivery order with "Received by" signed, and
 * the BAST when they make one — both kept on the DO. The first one marks it
 * received.
 */
export function UploadReceivedModal({ row, open, onClose, run }: { row: DeliveryRow; open: boolean; onClose: () => void; run: Run }) {
  const [form] = Form.useForm<UploadValues>();
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const kind = Form.useWatch("kind", form);
  const has = (wanted: FileKind) => row.files.some((item) => item.kind === wanted);
  const marksReceived = row.status === "issued" && kind !== "other";

  const submit = async (values: UploadValues) => {
    if (!file) return;
    setPending(true);
    const ok = await run(
      `upload:${row.id}`,
      () => attachDeliveryFile(row, file, values.kind, { name: values.received_name, title: values.received_title, on: values.received_on }),
      marksReceived ? `${FILE_KIND_LABEL[values.kind]} uploaded. The delivery order is marked received.` : `${FILE_KIND_LABEL[values.kind]} uploaded.`,
    );
    setPending(false);
    if (ok) {
      setFile(null);
      form.resetFields();
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={`Upload to ${row.number ?? "the delivery order"}`}
      okText="Upload"
      okButtonProps={{ disabled: !file, loading: pending, icon: <UploadOutlined /> }}
      onOk={() => form.submit()}
      destroyOnHidden
    >
      <Form<UploadValues>
        form={form}
        layout="vertical"
        requiredMark="optional"
        onFinish={submit}
        disabled={pending}
        initialValues={{
          kind: has("signed_do") && !has("bast") ? "bast" : "signed_do",
          received_name: row.received_by_name ?? row.contact_name ?? "",
          received_title: row.received_by_title ?? "",
          received_on: row.received_at?.slice(0, 10) ?? todayIso(),
        }}
      >
        <Form.Item label="What is it" name="kind">
          <Segmented<FileKind>
            block
            options={[
              { value: "signed_do", label: "Signed DO" },
              { value: "bast", label: "BAST" },
              { value: "other", label: "Other" },
            ]}
          />
        </Form.Item>
        <Typography.Paragraph type="secondary" style={{ fontSize: 13, marginTop: -8 }}>
          {kind === "bast"
            ? "The customer's “Berita Acara Serah Terima” (handover report) — kept with this delivery order."
            : kind === "other"
              ? "Anything else to keep with it, e.g. a goods receipt or an email."
              : "This delivery order with “Received by” signed (and stamped) by the customer."}
        </Typography.Paragraph>
        <Form.Item label="File" required>
          <Upload.Dragger
            accept="application/pdf,image/jpeg,image/png"
            maxCount={1}
            beforeUpload={(chosen) => {
              setFile(chosen);
              return false;
            }}
            onRemove={() => setFile(null)}
            fileList={file ? [{ uid: "chosen", name: file.name, status: "done" }] : []}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">Click or drop the scan here</p>
            <p className="ant-upload-hint">PDF, JPG or PNG, up to 15 MB</p>
          </Upload.Dragger>
        </Form.Item>
        {kind !== "other" ? (
          <Flex gap={12} wrap>
            <Form.Item label="Received by" name="received_name" rules={[{ max: 200 }]} style={{ flex: "1 1 180px" }}>
              <Input />
            </Form.Item>
            <Form.Item label="Position" name="received_title" rules={[{ max: 200 }]} style={{ flex: "1 1 140px" }}>
              <Input />
            </Form.Item>
            <Form.Item label="Received on" name="received_on" style={{ flex: "0 1 160px" }}>
              <DateInput />
            </Form.Item>
          </Flex>
        ) : null}
        {marksReceived ? <Alert type="info" showIcon title="This marks the delivery order received." /> : null}
      </Form>
    </Modal>
  );
}

/**
 * Who prepared and who delivered it, with their positions — correctable while
 * it waits for the customer (the PDF and the customer's link show the change).
 */
function SignersModal({ row, open, onClose, run }: { row: DeliveryRow; open: boolean; onClose: () => void; run: Run }) {
  const [form] = Form.useForm<Required<DeliverySigners>>();
  const [pending, setPending] = useState(false);
  const same = Form.useWatch("delivered_by_same", form) ?? row.delivered_by_same;
  const digital = row.signature_mode === "digital";

  const save = async (values: Required<DeliverySigners>) => {
    setPending(true);
    const signers = values.delivered_by_same ? { ...values, delivered_by_name: values.prepared_by_name, delivered_by_title: values.prepared_by_title } : values;
    const ok = await run(`signers:${row.id}`, () => updateDeliverySigners(row.id, signers), "Saved. The PDF shows the new names.");
    setPending(false);
    if (ok) onClose();
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={`Names & positions · ${row.number ?? ""}`}
      okText="Save"
      okButtonProps={{ loading: pending }}
      onOk={() => form.submit()}
      destroyOnHidden
      width={560}
    >
      <Form<Required<DeliverySigners>>
        form={form}
        layout="vertical"
        onFinish={save}
        disabled={pending}
        initialValues={{
          prepared_by_name: row.prepared_by_name ?? "",
          prepared_by_title: row.prepared_by_title ?? "",
          delivered_by_name: row.delivered_by_name ?? "",
          delivered_by_title: row.delivered_by_title ?? "",
          delivered_by_same: row.delivered_by_same,
        }}
      >
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item
              label="Prepared by — name"
              name="prepared_by_name"
              rules={[{ max: 200 }]}
              extra={digital ? "Signed digitally: the signatory's name and position are printed instead." : undefined}
            >
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item label="Position" name="prepared_by_title" rules={[{ max: 200 }]}>
              <Input placeholder="e.g. Sales Manager" />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="delivered_by_same" valuePropName="checked" style={{ marginBottom: 12 }}>
          <Checkbox>Delivered by the same person who prepared it</Checkbox>
        </Form.Item>
        {same ? null : (
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item label="Delivered by — name" name="delivered_by_name" rules={[{ max: 200 }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item label="Position" name="delivered_by_title" rules={[{ max: 200 }]}>
                <Input placeholder="e.g. Support Engineer" />
              </Form.Item>
            </Col>
          </Row>
        )}
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Only the names and positions change; the customer is not emailed. Once it is received, they stay as signed.
        </Typography.Text>
      </Form>
    </Modal>
  );
}

function CancelModal({ row, open, onClose, run }: { row: DeliveryRow; open: boolean; onClose: () => void; run: Run }) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={`Cancel ${row.number ?? "delivery order"}?`}
      okText="Cancel delivery order"
      cancelText="Keep it"
      okButtonProps={{ danger: true, loading: pending, disabled: !reason.trim() }}
      onOk={async () => {
        setPending(true);
        const ok = await run(`cancel:${row.id}`, () => cancelDeliveryOrder(row.id, reason.trim()), "Delivery order cancelled. Its servers can go on another one.");
        setPending(false);
        if (ok) onClose();
      }}
      destroyOnHidden
    >
      <Typography.Paragraph type="secondary">It is kept, marked cancelled; what it delivered counts as not delivered again.</Typography.Paragraph>
      <Input.TextArea rows={3} maxLength={1000} placeholder="Why, e.g. wrong version sent" value={reason} onChange={(event) => setReason(event.target.value)} />
    </Modal>
  );
}

function DeliveryOrderDrawer({ row, onClose, onEdit, run, busy }: { row: DeliveryRow | null; onClose: () => void; onEdit: (order: DeliveryOrder) => void; run: Run; busy: string | null }) {
  const viewPdf = usePdfViewer();
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const [uploading, setUploading] = useState(false);
  const [signers, setSigners] = useState(false);
  const issue = useIssue(row ?? ({ items: [], files: [] } as unknown as DeliveryRow), run);
  const { data: licensed } = useQuery({
    queryKey: ["invoice-licensed", row?.invoice_id],
    enabled: row?.status === "draft",
    queryFn: () => licenceIssued(row!.invoice_id),
  });
  if (!row) return <Drawer open={false} onClose={onClose} />;
  const kinds = new Set(row.files.map((file) => file.kind));

  return (
    <Drawer
      open
      onClose={onClose}
      size={780}
      destroyOnHidden
      title={
        <Flex gap={8} align="center" wrap>
          <span style={{ fontFamily: "Geist Mono, monospace" }}>{row.number ?? "Delivery order"}</span>
          <DeliveryStatusTag row={row} />
        </Flex>
      }
      extra={
        <Flex gap={8}>
          <Button icon={<FilePdfOutlined />} onClick={() => viewPdf(deliveryOrderPdf(row))}>
            View PDF
          </Button>
          {row.status === "issued" ? (
            <Button
              icon={<LinkOutlined />}
              onClick={() =>
                navigator.clipboard
                  .writeText(`${env.siteUrl}/do/${row.public_token}`)
                  .then(() => message.success("Customer link copied — the page where they view the DO and confirm receipt."))
              }
            >
              Copy customer link
            </Button>
          ) : null}
          {row.status === "issued" ? (
            <Button icon={<TeamOutlined />} onClick={() => setSigners(true)}>
              Names & positions
            </Button>
          ) : null}
          {row.status === "draft" ? (
            <>
              <Button icon={<EditOutlined />} onClick={() => onEdit(row)}>
                Edit
              </Button>
              <Button
                type="primary"
                icon={<SendOutlined />}
                loading={busy === `issue:${row.id}`}
                disabled={licensed === false}
                title={licensed === false ? "Issue the licence first" : undefined}
                onClick={issue}
              >
                Issue
              </Button>
            </>
          ) : null}
        </Flex>
      }
    >
      <Flex vertical gap={16}>
        <Typography.Text type="secondary">
          To <Typography.Text strong>{row.ship_to_name}</Typography.Text> · invoice {row.invoice_number}
          {row.po_number ? ` · PO ${row.po_number}` : ""}
          {row.quotation_number ? ` · quotation ${row.quotation_number}` : ""}
        </Typography.Text>
        <StatRow
          stats={[
            { label: "Servers", value: servers(row), strong: true },
            { label: "Delivery method", value: METHOD_LABEL[row.method as DeliveryMethod] ?? row.method },
            { label: "Delivery date", value: row.delivery_date ? formatInvoiceDate(row.delivery_date) : "—" },
            { label: "Received", value: row.received_at ? formatInvoiceDate(row.received_at.slice(0, 10)) : "—" },
          ]}
        />
        <StandingPanel>
          {row.status === "draft" ? (
            licensed === false ? (
              <Typography.Text type="warning">The licence for {row.invoice_number} has not been issued yet. Issue and send it in Licences first, then issue this delivery order.</Typography.Text>
            ) : (
              <Typography.Text type="secondary">A draft — not sent. Issue it to email it with a link to confirm receipt.</Typography.Text>
            )
          ) : null}
          {row.status === "issued" ? (
            <>
              <Typography.Text>
                <ClockCircleOutlined style={{ color: token.colorWarning }} /> Sent to {row.contact_email}
                {row.issued_at ? ` on ${formatInvoiceDate(row.issued_at.slice(0, 10))}` : ""}. Waiting for the customer to confirm receipt, or for the signed DO / BAST.
              </Typography.Text>
              <Button icon={<UploadOutlined />} onClick={() => setUploading(true)}>
                Upload signed DO / BAST
              </Button>
            </>
          ) : null}
          {row.status === "received" ? (
            <Typography.Text>
              <CheckCircleOutlined style={{ color: token.colorSuccess }} /> Received
              {row.received_by_name ? ` by ${row.received_by_name}${row.received_by_title ? ` (${row.received_by_title})` : ""}` : ""}
              {row.received_at ? ` on ${formatInvoiceDate(row.received_at.slice(0, 10))}` : ""}
              {row.received_via === "online" ? ", confirmed online." : ", signed copy uploaded."}
              {!kinds.has("bast") ? " No BAST uploaded." : ""}
            </Typography.Text>
          ) : null}
          {row.status === "cancelled" ? <Typography.Text type="danger">Cancelled{row.cancel_reason ? `: “${row.cancel_reason}”` : "."}</Typography.Text> : null}
        </StandingPanel>
        <Tabs
          items={[
            {
              key: "overview",
              label: "Overview",
              children: (
                <InfoSection
                  title="Details"
                  items={[
                    { label: "Deliver to", value: <span style={{ whiteSpace: "pre-line" }}>{[row.ship_to_name, row.ship_to_company, row.ship_to_address].filter(Boolean).join("\n")}</span> },
                    { label: "Receiver", value: [row.contact_name, row.contact_email, row.contact_phone].filter(Boolean).join(" · ") || "—" },
                    { label: "CC", value: row.cc_emails?.length ? row.cc_emails.join(", ") : "—" },
                    { label: "Software version", value: row.software_version || "—" },
                    { label: "Signed by us", value: row.signature_mode === "qr" ? "QR code" : row.signature_mode === "digital" ? "Digital signature" : "By hand" },
                    { label: "Prepared by", value: [row.prepared_by_name, row.prepared_by_title].filter(Boolean).join(", ") || "—" },
                    {
                      label: "Delivered by",
                      value: row.delivered_by_same ? "Same as prepared by" : [row.delivered_by_name, row.delivered_by_title].filter(Boolean).join(", ") || "—",
                    },
                    { label: "Notes", wide: true, value: <span style={{ whiteSpace: "pre-line" }}>{row.notes || "—"}</span> },
                  ]}
                />
              ),
            },
            {
              key: "items",
              label: `Items (${row.items.length})`,
              children: (
                <Table
                  rowKey="id"
                  size="small"
                  pagination={false}
                  dataSource={[...row.items].sort((a, b) => a.position - b.position)}
                  columns={[
                    {
                      title: "Item",
                      key: "item",
                      render: (_, item) => (
                        <Flex vertical>
                          <Typography.Text strong>{item.description}</Typography.Text>
                          {item.detail ? (
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                              {item.detail}
                            </Typography.Text>
                          ) : null}
                        </Flex>
                      ),
                    },
                    { title: "Quantity", key: "qty", align: "right", width: 120, render: (_, item) => `${Number(item.quantity)} ${item.unit}` },
                  ]}
                />
              ),
            },
            {
              key: "documents",
              label: `Received documents (${row.files.length})`,
              children: <ReceivedDocuments row={row} run={run} onUpload={() => setUploading(true)} />,
            },
            { key: "history", label: "History", children: <DocumentHistory type="delivery_order" id={row.id} /> },
          ]}
        />
      </Flex>
      <UploadReceivedModal row={row} open={uploading} onClose={() => setUploading(false)} run={run} />
      <SignersModal row={row} open={signers} onClose={() => setSigners(false)} run={run} />
    </Drawer>
  );
}

/** The signed DO, the BAST and anything else the customer sent back. */
function ReceivedDocuments({ row, run, onUpload }: { row: DeliveryRow; run: Run; onUpload: () => void }) {
  const viewPdf = usePdfViewer();
  const { token } = theme.useToken();
  const canUpload = row.status === "issued" || row.status === "received";
  const missing = (["signed_do", "bast"] as FileKind[]).filter((kind) => !row.files.some((file) => file.kind === kind));
  return (
    <Flex vertical gap={12}>
      {row.files.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={canUpload ? "Nothing yet. Upload the delivery order the customer signed, and their BAST if they made one." : "Issue the delivery order first."}
        />
      ) : (
        <div style={{ border: `1px solid ${token.colorBorderSecondary}`, borderRadius: token.borderRadiusLG }}>
          {[...row.files]
            .sort((a, b) => a.uploaded_at.localeCompare(b.uploaded_at))
            .map((file, index) => (
              <Flex key={file.id} gap={12} align="center" justify="space-between" style={{ padding: "10px 14px", borderTop: index ? `1px solid ${token.colorBorderSecondary}` : undefined }}>
                <Flex gap={10} align="center" style={{ minWidth: 0 }}>
                  <Tag color={file.kind === "other" ? "default" : "success"} style={{ marginInlineEnd: 0 }}>
                    {FILE_KIND_LABEL[file.kind as FileKind]}
                  </Tag>
                  <div style={{ minWidth: 0 }}>
                    <Typography.Text ellipsis style={{ display: "block" }}>
                      {file.file_name || "Document"}
                    </Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      Uploaded {formatInvoiceDate(file.uploaded_at.slice(0, 10))}
                    </Typography.Text>
                  </div>
                </Flex>
                <Flex gap={4}>
                  <Button size="small" icon={<EyeOutlined />} onClick={() => viewPdf(deliveryFileRequest(file, row.number))}>
                    View
                  </Button>
                  <Popconfirm title="Remove this file?" description="It is deleted; the history keeps that it was uploaded." okText="Remove" okButtonProps={{ danger: true }} onConfirm={() => run(`remove:${row.id}`, () => removeDeliveryFile(file), "File removed.")}>
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label={`Remove ${file.file_name ?? "file"}`} />
                  </Popconfirm>
                </Flex>
              </Flex>
            ))}
        </div>
      )}
      {canUpload ? (
        <Flex gap={8} align="center" wrap>
          <Button icon={<UploadOutlined />} onClick={onUpload}>
            Upload signed DO, BAST or other
          </Button>
          {missing.length && row.files.length ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Not uploaded yet: {missing.map((kind) => FILE_KIND_LABEL[kind]).join(", ")}
            </Typography.Text>
          ) : null}
        </Flex>
      ) : null}
    </Flex>
  );
}

/** For an invoice's drawer: its delivery orders, what is left to deliver, and (for licensing) "Create delivery order". */
export function InvoiceDeliveries({ invoice, onCreate, onOpen }: { invoice: { id: string; status: string; number: string | null }; onCreate?: () => void; onOpen?: (id: string) => void }) {
  const viewPdf = usePdfViewer();
  const { token } = theme.useToken();
  const { data, isLoading } = useQuery({
    queryKey: ["invoice-deliveries", invoice.id],
    queryFn: async () => {
      const [{ data: rows, error }, { data: remaining }, licensed] = await Promise.all([
        supabase.from("delivery_orders").select(SELECT).eq("invoice_id", invoice.id).order("created_at"),
        supabase.rpc("delivery_remaining", { p_invoice_id: invoice.id }),
        licenceIssued(invoice.id),
      ]);
      if (error) throw error;
      const left = ((remaining as { remaining: number }[] | null) ?? []).reduce((sum, group) => sum + Number(group.remaining), 0);
      return { rows: (rows ?? []) as unknown as DeliveryRow[], left, licensed };
    },
  });
  const paid = invoice.status === "paid";
  const left = data?.left ?? 0;
  return (
    <Flex vertical gap={12}>
      {!paid ? (
        <Alert type="info" showIcon title="Delivery orders go out once the invoice is paid." />
      ) : data && !data.licensed && left > 0 ? (
        <Alert
          type="warning"
          showIcon
          title="Issue the licence first"
          description="A delivery order goes out after the licence is issued and sent. You can prepare a draft now."
          action={
            onCreate ? (
              <Button size="small" onClick={onCreate}>
                Prepare draft
              </Button>
            ) : undefined
          }
        />
      ) : left > 0 ? (
        <Flex justify="space-between" align="center" gap={12} wrap style={{ padding: "10px 14px", borderRadius: token.borderRadiusLG, background: token.colorFillQuaternary }}>
          <Typography.Text>
            {left} server{left === 1 ? "" : "s"} still to deliver.
          </Typography.Text>
          {onCreate ? (
            <Button type="primary" icon={<SendOutlined />} onClick={onCreate}>
              Create delivery order
            </Button>
          ) : (
            <Typography.Text type="secondary">Licensing sends the delivery order.</Typography.Text>
          )}
        </Flex>
      ) : data ? (
        <Alert type="success" showIcon title="Everything on this invoice has been delivered." />
      ) : null}
      <Table<DeliveryRow>
        rowKey="id"
        size="small"
        loading={isLoading}
        pagination={false}
        dataSource={data?.rows ?? []}
        locale={{ emptyText: "No delivery orders yet." }}
        onRow={(row) => (onOpen ? { onClick: () => onOpen(row.id), style: { cursor: "pointer" } } : {})}
        columns={[
          { title: "Delivery order", key: "number", render: (_, row) => <Typography.Text style={mono}>{row.number}</Typography.Text> },
          { title: "Date", key: "date", render: (_, row) => (row.delivery_date ? formatInvoiceDate(row.delivery_date) : "—") },
          { title: "Servers", key: "servers", align: "right", render: (_, row) => servers(row) },
          {
            title: "Status",
            key: "status",
            render: (_, row) => (
              <Flex gap={4} wrap>
                <DeliveryStatusTag row={row} />
                <FileTags files={row.files} />
              </Flex>
            ),
          },
          {
            title: <span className="sr-only">PDF</span>,
            key: "pdf",
            align: "right",
            render: (_, row) => (
              <Button
                size="small"
                type="text"
                icon={<FilePdfOutlined />}
                aria-label={`View ${row.number ?? "delivery order"}`}
                onClick={(event) => {
                  event.stopPropagation();
                  viewPdf(deliveryOrderPdf(row));
                }}
              />
            ),
          },
        ]}
      />
    </Flex>
  );
}

