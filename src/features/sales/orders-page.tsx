import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Drawer, Flex, Input, Segmented, Table, Tag, Typography, theme } from "antd";
import type { TableColumnsType } from "antd";
import {
  CarOutlined,
  CheckCircleFilled,
  ClockCircleOutlined,
  EyeOutlined,
  FileDoneOutlined,
  FilePdfOutlined,
  FileProtectOutlined,
  InboxOutlined,
  KeyOutlined,
  MinusCircleOutlined,
  TransactionOutlined,
} from "@ant-design/icons";
import { PageTitle } from "@/components/app-shell";
import { usePdfViewer } from "@/components/pdf-viewer-context";
import { formatInvoiceDate, formatMoney } from "@/lib/invoices";
import { supabase } from "@/lib/supabase";
import { invoicePdf, purchaseOrderPdf, quotationPdf } from "./api";
import { FILE_KIND_LABEL, deliveryFileRequest, deliveryOrderPdf, type DeliveryFile, type FileKind } from "./delivery-api";
import { DeliveryStatusTag } from "./delivery-orders-page";
import { InvoiceStatusTag } from "./invoices-page";

type Do = {
  id: string;
  number: string | null;
  status: string;
  received_via: string | null;
  received_by_name: string | null;
  received_at: string | null;
  delivery_date: string | null;
  items: { quantity: number }[];
  files: DeliveryFile[];
};
type InvoiceRow = {
  id: string;
  number: string | null;
  status: "paid" | "unpaid" | "void";
  issue_date: string;
  due_date: string;
  paid_at: string | null;
  total: number;
  currency: string;
  decimal_places: number;
  po_number: string | null;
  po_path: string | null;
  po_file_name: string | null;
  groups: { quantity: number }[];
  licenses: { id: string; label: string; status: string; issued_at: string | null }[];
  delivery_orders: Do[];
};
type Order = {
  id: string;
  number: string | null;
  status: string;
  company: string | null;
  contact_name: string;
  contact_email: string | null;
  issue_date: string;
  sent_at: string | null;
  accepted_at: string | null;
  total: number;
  currency: string;
  decimal_places: number;
  created_at: string;
  quote_request: { id: string; reference: string | null; created_at: string; edition_name: string | null } | null;
  invoices: InvoiceRow[];
};

type Stage = "quoting" | "accepted" | "invoiced" | "to_deliver" | "partly_delivered" | "awaiting_receipt" | "delivered" | "closed";
const STAGE: Record<Stage, { label: string; color: string }> = {
  quoting: { label: "Quotation", color: "default" },
  accepted: { label: "Accepted · to invoice", color: "blue" },
  invoiced: { label: "Invoiced · awaiting payment", color: "warning" },
  to_deliver: { label: "Paid · to deliver", color: "purple" },
  partly_delivered: { label: "Partly delivered · rest to deliver", color: "purple" },
  awaiting_receipt: { label: "Delivered · awaiting receipt", color: "processing" },
  delivered: { label: "Delivered", color: "success" },
  closed: { label: "Closed", color: "default" },
};

const SELECT = `id, number, status, company, contact_name, contact_email, issue_date, sent_at, accepted_at, total, currency, decimal_places, created_at,
  quote_request:quote_requests(id, reference, created_at, edition_name),
  invoices!invoices_quotation_id_fkey(id, number, status, issue_date, due_date, paid_at, total, currency, decimal_places, po_number, po_path, po_file_name,
    groups:invoice_groups(quantity),
    licenses:licenses!licenses_invoice_id_fkey(id, label, status, issued_at),
    delivery_orders!delivery_orders_invoice_id_fkey(id, number, status, received_via, received_by_name, received_at, delivery_date, items:delivery_order_items(quantity), files:delivery_order_files(*)))`;

/** The live invoice of an order (not void), else the latest one. */
const invoiceOf = (order: Order) => order.invoices.find((invoice) => invoice.status !== "void") ?? order.invoices.at(-1) ?? null;
const liveDos = (invoice: InvoiceRow | null) => (invoice?.delivery_orders ?? []).filter((item) => item.status !== "cancelled");
const ordered = (invoice: InvoiceRow) => invoice.groups.reduce((sum, group) => sum + Number(group.quantity), 0);
const delivered = (invoice: InvoiceRow) => liveDos(invoice).reduce((sum, item) => sum + item.items.reduce((total, line) => total + Number(line.quantity), 0), 0);

function stageOf(order: Order): Stage {
  const invoice = invoiceOf(order);
  if (order.status === "declined" || order.status === "cancelled") return "closed";
  if (!invoice || invoice.status === "void") return order.status === "accepted" ? "accepted" : "quoting";
  if (invoice.status === "unpaid") return "invoiced";
  const dos = liveDos(invoice);
  const all = delivered(invoice) >= ordered(invoice) && ordered(invoice) > 0;
  // A DO is out and the customer has not confirmed it (online or by signed DO / BAST).
  if (dos.some((item) => item.status === "issued")) return "awaiting_receipt";
  if (all && dos.length && dos.every((item) => item.status === "received")) return "delivered";
  if (dos.some((item) => item.status === "received")) return "partly_delivered";
  return "to_deliver";
}

/**
 * One order, end to end, on one page: the quote request, the quotation, the
 * customer's PO, the invoice and its payment, every delivery order with the
 * signed DO and BAST, and the licences — each with its document.
 */
export function OrdersPage() {
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<"all" | Stage>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["order-overview"],
    queryFn: async () => {
      const { data: rows, error: loadError } = await supabase.from("quotations").select(SELECT).order("created_at", { ascending: false }).limit(500);
      if (loadError) throw loadError;
      return ((rows ?? []) as unknown as Order[]).map((order) => ({ ...order, stage: stageOf(order) }));
    },
  });

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data ?? []).filter((order) => {
      if (stage !== "all" && order.stage !== stage) return false;
      if (!query) return true;
      const numbers = [
        order.number,
        order.company,
        order.contact_name,
        order.quote_request?.reference,
        ...order.invoices.flatMap((invoice) => [invoice.number, invoice.po_number, ...invoice.delivery_orders.map((item) => item.number)]),
      ];
      return numbers.some((value) => (value ?? "").toLowerCase().includes(query));
    });
  }, [data, search, stage]);

  const columns: TableColumnsType<Order & { stage: Stage }> = [
    {
      title: "Customer",
      key: "customer",
      render: (_, order) => (
        <Flex vertical>
          <span>{order.company || order.contact_name}</span>
          {order.company ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {order.contact_name}
            </Typography.Text>
          ) : null}
        </Flex>
      ),
    },
    {
      title: "Documents",
      key: "docs",
      render: (_, order) => {
        const invoice = invoiceOf(order);
        const chain = [order.number, invoice?.po_number ? `PO ${invoice.po_number}` : null, invoice?.number].filter(Boolean);
        return (
          <Typography.Text type="secondary" style={{ fontFamily: "Geist Mono, monospace", fontSize: 12 }}>
            {chain.join("  →  ")}
          </Typography.Text>
        );
      },
    },
    {
      title: "Delivery",
      key: "delivery",
      // Each delivery order with where it stands, then what is still to go out.
      render: (_, order) => {
        const invoice = invoiceOf(order);
        if (!invoice || invoice.status !== "paid") return <Typography.Text type="secondary">—</Typography.Text>;
        const dos = liveDos(invoice);
        const left = ordered(invoice) - delivered(invoice);
        return (
          <Flex vertical gap={4} align="flex-start">
            {dos.map((item) => (
              <Flex key={item.id} gap={4} align="center" wrap>
                <Typography.Text style={{ fontFamily: "Geist Mono, monospace", fontSize: 12 }}>{item.number}</Typography.Text>
                <DeliveryStatusTag row={item} />
                {[...new Set(item.files.map((file) => file.kind as FileKind))]
                  .filter((kind) => kind !== "other")
                  .map((kind) => (
                    <Tag key={kind} color="success" style={{ marginInlineEnd: 0 }}>
                      {FILE_KIND_LABEL[kind]}
                    </Tag>
                  ))}
              </Flex>
            ))}
            {left > 0 ? (
              <Typography.Text type="warning" style={{ fontSize: 12 }}>
                {left} server{left === 1 ? "" : "s"} to deliver
              </Typography.Text>
            ) : null}
          </Flex>
        );
      },
    },
    {
      title: "Total",
      key: "total",
      align: "right",
      responsive: ["md"],
      render: (_, order) => formatMoney(invoiceOf(order)?.total ?? order.total, order.currency, order.decimal_places),
    },
    { title: "Stage", key: "stage", render: (_, order) => <Tag color={STAGE[order.stage].color}>{STAGE[order.stage].label}</Tag> },
  ];

  const count = (wanted: Stage) => (data ?? []).filter((order) => order.stage === wanted).length;

  return (
    <>
      <PageTitle title="Order overview" description="Every order from quotation to delivery on one page. Search by any number — quotation, PO, invoice or delivery order." />
      {error ? <Alert type="error" showIcon title="The orders could not be loaded. Please reload the page." style={{ marginBottom: 16 }} /> : null}
      <Flex wrap gap={12} justify="space-between" style={{ marginBottom: 16 }}>
        <Segmented<"all" | Stage>
          value={stage}
          onChange={setStage}
          options={[
            { value: "all", label: "All" },
            { value: "invoiced", label: `Awaiting payment ${count("invoiced")}` },
            { value: "to_deliver", label: `To deliver ${count("to_deliver")}` },
            { value: "awaiting_receipt", label: `Awaiting receipt ${count("awaiting_receipt")}` },
            { value: "delivered", label: "Delivered" },
          ]}
        />
        <Input.Search allowClear value={search} placeholder="QUO, PO, INV or DO number, or customer" onChange={(event) => setSearch(event.target.value)} style={{ maxWidth: 340 }} />
      </Flex>
      <Table
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={rows}
        pagination={{ pageSize: 25, hideOnSinglePage: true, showSizeChanger: false }}
        scroll={{ x: 900 }}
        locale={{ emptyText: data && data.length > 0 ? "Nothing matches." : "No orders yet." }}
        onRow={(order) => ({ onClick: () => setOpenId(order.id), style: { cursor: "pointer" } })}
      />
      <OrderDrawer order={(openId && data?.find((order) => order.id === openId)) || null} onClose={() => setOpenId(null)} />
    </>
  );
}

type Step = { key: string; icon: React.ReactNode; title: string; done: boolean; current?: boolean; children: React.ReactNode };

function OrderDrawer({ order, onClose }: { order: (Order & { stage: Stage }) | null; onClose: () => void }) {
  const { token } = theme.useToken();
  const viewPdf = usePdfViewer();
  const navigate = useNavigate();
  if (!order) return <Drawer open={false} onClose={onClose} />;
  const invoice = invoiceOf(order);
  const dos = invoice?.delivery_orders ?? [];
  const left = invoice ? ordered(invoice) - delivered(invoice) : 0;
  const meta = (text: React.ReactNode) => (
    <Typography.Text type="secondary" style={{ fontSize: 13 }}>
      {text}
    </Typography.Text>
  );
  const pdfButton = (label: string, onClick: () => void) => (
    <Button size="small" icon={<FilePdfOutlined />} onClick={onClick}>
      {label}
    </Button>
  );

  const steps: Step[] = [
    {
      key: "request",
      icon: <InboxOutlined />,
      title: "Quote request",
      done: Boolean(order.quote_request),
      children: order.quote_request ? (
        <Flex gap={8} align="center" wrap>
          {meta(`${order.quote_request.reference ?? "Request"} · ${formatInvoiceDate(order.quote_request.created_at.slice(0, 10))}${order.quote_request.edition_name ? ` · ${order.quote_request.edition_name}` : ""}`)}
          <Button size="small" type="link" onClick={() => navigate("/sales/quote-requests")}>
            Quote requests
          </Button>
        </Flex>
      ) : (
        meta("Made directly, not from a request.")
      ),
    },
    {
      key: "quotation",
      icon: <FileDoneOutlined />,
      title: `Quotation ${order.number ?? ""}`,
      done: order.status === "accepted",
      current: order.stage === "quoting",
      children: (
        <Flex gap={8} align="center" wrap>
          {meta(
            `${order.status[0].toUpperCase()}${order.status.slice(1)} · ${formatMoney(order.total, order.currency, order.decimal_places)}${order.accepted_at ? ` · accepted ${formatInvoiceDate(order.accepted_at.slice(0, 10))}` : order.sent_at ? ` · sent ${formatInvoiceDate(order.sent_at.slice(0, 10))}` : ""}`,
          )}
          {pdfButton("Quotation", () => viewPdf(quotationPdf(order.id, order.number)))}
        </Flex>
      ),
    },
    {
      key: "po",
      icon: <FileProtectOutlined />,
      title: "Customer's purchase order",
      done: Boolean(invoice?.po_number || invoice?.po_path),
      children:
        invoice && (invoice.po_number || invoice.po_path) ? (
          <Flex gap={8} align="center" wrap>
            {invoice.po_number ? meta(invoice.po_number) : null}
            {invoice.po_path ? (
              <Button size="small" icon={<EyeOutlined />} onClick={() => viewPdf(purchaseOrderPdf({ ...invoice, po_path: invoice.po_path! }))}>
                {invoice.po_file_name || "PO"}
              </Button>
            ) : null}
          </Flex>
        ) : (
          meta("None recorded.")
        ),
    },
    {
      key: "invoice",
      icon: <TransactionOutlined />,
      title: invoice ? `Invoice ${invoice.number ?? ""}` : "Invoice",
      done: invoice?.status === "paid",
      current: order.stage === "accepted" || order.stage === "invoiced",
      children: invoice ? (
        <Flex gap={8} align="center" wrap>
          <InvoiceStatusTag invoice={invoice} />
          {meta(
            `${formatMoney(invoice.total, invoice.currency, invoice.decimal_places)} · issued ${formatInvoiceDate(invoice.issue_date)}${invoice.paid_at ? ` · paid ${formatInvoiceDate(invoice.paid_at.slice(0, 10))}` : ` · due ${formatInvoiceDate(invoice.due_date)}`}`,
          )}
          {pdfButton("Invoice", () => viewPdf(invoicePdf(invoice.id, invoice.number)))}
          <Button size="small" type="link" onClick={() => navigate(`/sales/invoices?invoice=${invoice.id}`)}>
            Open
          </Button>
        </Flex>
      ) : (
        meta(order.status === "accepted" ? "Not converted yet." : "After the quotation is accepted.")
      ),
    },
    {
      key: "delivery",
      icon: <CarOutlined />,
      title: "Delivery",
      done: order.stage === "delivered",
      current: order.stage === "to_deliver" || order.stage === "partly_delivered" || order.stage === "awaiting_receipt",
      children: (
        <Flex vertical gap={8}>
          {invoice?.status === "paid" && left > 0 ? (
            <Flex gap={8} align="center" wrap>
              {meta(`${left} server${left === 1 ? "" : "s"} still to deliver.`)}
              <Button size="small" type="primary" onClick={() => navigate(`/sales/delivery-orders?new=${invoice.id}`)}>
                Create delivery order
              </Button>
            </Flex>
          ) : null}
          {dos.length === 0 && !(invoice?.status === "paid") ? meta("After the invoice is paid.") : null}
          {dos.map((item) => (
            <div key={item.id} style={{ padding: "8px 12px", borderRadius: token.borderRadius, border: `1px solid ${token.colorBorderSecondary}` }}>
              <Flex gap={8} align="center" wrap>
                <Typography.Text style={{ fontFamily: "Geist Mono, monospace", fontSize: 13 }}>{item.number}</Typography.Text>
                <DeliveryStatusTag row={item} />
                {meta(
                  `${item.items.reduce((sum, line) => sum + Number(line.quantity), 0)} servers${item.delivery_date ? ` · ${formatInvoiceDate(item.delivery_date)}` : ""}${item.received_by_name ? ` · received by ${item.received_by_name}` : ""}`,
                )}
              </Flex>
              <Flex gap={6} wrap style={{ marginTop: 6 }}>
                {pdfButton("Delivery order", () => viewPdf(deliveryOrderPdf(item)))}
                {item.files.map((file) => (
                  <Button key={file.id} size="small" icon={<EyeOutlined />} onClick={() => viewPdf(deliveryFileRequest(file, item.number))}>
                    {FILE_KIND_LABEL[file.kind as FileKind]}
                  </Button>
                ))}
                <Button size="small" type="link" onClick={() => navigate(`/sales/delivery-orders?do=${item.id}`)}>
                  Open
                </Button>
              </Flex>
            </div>
          ))}
        </Flex>
      ),
    },
    {
      key: "licences",
      icon: <KeyOutlined />,
      title: "Licences",
      done: Boolean(invoice?.licenses.some((licence) => licence.status === "issued")),
      children: invoice?.licenses.length ? (
        <Flex gap={6} wrap align="center">
          {invoice.licenses.map((licence) => (
            <Tag key={licence.id} color={licence.status === "issued" ? "success" : "default"}>
              {licence.label} · {licence.status}
            </Tag>
          ))}
          <Button size="small" type="link" onClick={() => navigate("/licensing/licences")}>
            Licences
          </Button>
        </Flex>
      ) : (
        meta("None yet.")
      ),
    },
  ];

  return (
    <Drawer
      open
      onClose={onClose}
      size={760}
      title={
        <Flex gap={8} align="center" wrap>
          <span>{order.company || order.contact_name}</span>
          <Tag color={STAGE[order.stage].color}>{STAGE[order.stage].label}</Tag>
        </Flex>
      }
    >
      <div>
        {steps.map((step, index) => {
          const last = index === steps.length - 1;
          const color = step.done ? token.colorSuccess : step.current ? token.colorPrimary : token.colorTextQuaternary;
          return (
            <div key={step.key} style={{ display: "grid", gridTemplateColumns: "36px minmax(0, 1fr)", columnGap: 14 }}>
              <Flex vertical align="center">
                <Flex
                  align="center"
                  justify="center"
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    fontSize: 16,
                    flexShrink: 0,
                    color,
                    background: step.done ? token.colorSuccessBg : step.current ? token.colorPrimaryBg : token.colorFillTertiary,
                  }}
                >
                  {step.icon}
                </Flex>
                {last ? null : <div style={{ width: 2, flex: 1, minHeight: 16, margin: "4px 0", background: step.done ? token.colorSuccessBorder : token.colorBorderSecondary }} />}
              </Flex>
              <div style={{ paddingBottom: last ? 0 : 20, minWidth: 0 }}>
                <Flex align="center" gap={8} style={{ minHeight: 36 }}>
                  <Typography.Text strong>{step.title}</Typography.Text>
                  {step.done ? (
                    <CheckCircleFilled style={{ color: token.colorSuccess }} aria-label="Done" />
                  ) : step.current ? (
                    <ClockCircleOutlined style={{ color: token.colorPrimary }} aria-label="Next" />
                  ) : (
                    <MinusCircleOutlined style={{ color: token.colorTextQuaternary }} aria-hidden />
                  )}
                </Flex>
                {step.children}
              </div>
            </div>
          );
        })}
      </div>
    </Drawer>
  );
}
