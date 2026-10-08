import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, App, Button, Checkbox, Col, Divider, Drawer, Dropdown, Flex, Form, Input, InputNumber, Row, Segmented, Table, Tag, Tooltip, Typography } from "antd";
import type { MenuProps, TableColumnsType } from "antd";
import { CheckCircleOutlined, EditOutlined, FilePdfOutlined, FileTextOutlined, MoreOutlined, RollbackOutlined, StopOutlined, UndoOutlined, UserOutlined } from "@ant-design/icons";
import { PageTitle } from "@/components/app-shell";
import { formatInvoiceDate, formatMoney, isOverdue, type Invoice } from "@/lib/invoices";
import { errorText } from "@/lib/sales";
import { supabase } from "@/lib/supabase";
import { usePdfViewer } from "@/components/pdf-viewer-context";
import { invoicePdf, quotationPdf, setInvoiceStatus } from "./api";
import { useAction } from "./use-action";

type Row = Invoice & { license: { label: string } | null };
type Filter = "all" | "unpaid" | "overdue" | "paid" | "void";

export function InvoiceStatusTag({ invoice }: { invoice: Pick<Invoice, "status" | "due_date"> }) {
  if (isOverdue(invoice)) return <Tag color="error">Overdue</Tag>;
  if (invoice.status === "unpaid") return <Tag color="warning">Payment required</Tag>;
  if (invoice.status === "paid") return <Tag color="success">Paid</Tag>;
  return <Tag>Void</Tag>;
}

/** Every invoice, newest first. Invoices are made by converting an accepted quotation. */
export function InvoicesPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Row | null>(null);
  const { run, busy } = useAction([["invoices"], ["quotations"]]);
  const viewPdf = usePdfViewer();

  const { data, isLoading, error } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      // Named link: licences also point at invoices (licenses.invoice_id).
      const { data: rows, error: loadError } = await supabase
        .from("invoices")
        .select("*, license:licenses!invoices_license_id_fkey(label)")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (loadError) throw loadError;
      return (rows ?? []) as unknown as Row[];
    },
  });

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data ?? []).filter((row) => {
      const state = isOverdue(row) ? "overdue" : row.status;
      if (filter !== "all" && !(filter === state || (filter === "unpaid" && row.status === "unpaid"))) return false;
      if (!query) return true;
      return [row.number, row.bill_to_name, row.bill_to_company, row.quotation_number, row.license?.label].some((value) => (value ?? "").toLowerCase().includes(query));
    });
  }, [data, filter, search]);

  const outstanding = (data ?? []).filter((row) => row.status === "unpaid");

  const columns: TableColumnsType<Row> = [
    {
      title: "Invoice",
      key: "number",
      render: (_, row) => (
        <Flex vertical>
          <Typography.Text style={{ fontFamily: "Geist Mono, monospace", fontSize: 13 }}>{row.number}</Typography.Text>
          {row.quotation_number ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Quotation ref. {row.quotation_number}
            </Typography.Text>
          ) : null}
        </Flex>
      ),
    },
    {
      title: "Invoiced to",
      key: "to",
      render: (_, row) => (
        <Flex vertical>
          <span>{row.bill_to_name}</span>
          {row.license?.label && row.license.label !== row.bill_to_name ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Licence: {row.license.label}
            </Typography.Text>
          ) : null}
          {!row.owner_id ? (
            <Typography.Text type="warning" style={{ fontSize: 12 }}>
              Awaiting customer account
            </Typography.Text>
          ) : null}
        </Flex>
      ),
    },
    { title: "Issued", dataIndex: "issue_date", render: (value: string) => formatInvoiceDate(value), responsive: ["lg"] },
    { title: "Due", dataIndex: "due_date", render: (value: string) => formatInvoiceDate(value), sorter: (a, b) => a.due_date.localeCompare(b.due_date), responsive: ["md"] },
    {
      title: "Total",
      key: "total",
      align: "right",
      render: (_, row) => <Typography.Text strong>{formatMoney(row.total, row.currency, row.decimal_places)}</Typography.Text>,
      sorter: (a, b) => Number(a.total) - Number(b.total),
    },
    { title: "Status", key: "status", render: (_, row) => <InvoiceStatusTag invoice={row} /> },
    {
      title: <span className="sr-only">Actions</span>,
      key: "actions",
      align: "right",
      render: (_, row) => {
        const k = (name: string) => `${name}:${row.id}`;
        const more: MenuProps["items"] = [
          ...(row.quotation_id
            ? [{ key: "quote", icon: <FileTextOutlined />, label: `Quotation ${row.quotation_number ?? ""}`, onClick: () => viewPdf(quotationPdf(row.quotation_id!, row.quotation_number)) }]
            : []),
          ...(row.quotation_id && !row.owner_id
            ? [{ key: "customer", icon: <UserOutlined />, label: "Link customer account", onClick: () => navigate(`/sales/quotations/${row.quotation_id}/customer`) }]
            : []),
          ...(row.status === "paid"
            ? [{ key: "unpaid", icon: <UndoOutlined />, label: "Mark not paid", onClick: () => run(k("unpaid"), () => setInvoiceStatus(row.id, "unpaid"), "Marked not paid.") }]
            : []),
          ...(row.status !== "void"
            ? [
                { type: "divider" as const },
                { key: "void", icon: <StopOutlined />, label: "Void invoice", danger: true, onClick: () => run(k("void"), () => setInvoiceStatus(row.id, "void"), "Invoice voided.") },
              ]
            : []),
        ];
        return (
          <Flex gap={4} justify="flex-end" align="center" wrap={false}>
            {row.status === "unpaid" ? (
              <Button size="small" type="primary" icon={<CheckCircleOutlined />} loading={busy === k("paid")} onClick={() => run(k("paid"), () => setInvoiceStatus(row.id, "paid"), "Marked paid. The customer has been emailed a receipt.")}>
                Mark paid
              </Button>
            ) : row.status === "void" ? (
              <Button size="small" icon={<RollbackOutlined />} loading={busy === k("restore")} onClick={() => run(k("restore"), () => setInvoiceStatus(row.id, "unpaid"), "Invoice restored.")}>
                Restore
              </Button>
            ) : null}
            <Tooltip title="View PDF">
              <Button size="small" type="text" icon={<FilePdfOutlined />} onClick={() => viewPdf(invoicePdf(row.id, row.number))} aria-label="View PDF" />
            </Tooltip>
            {row.status === "unpaid" ? (
              <Tooltip title="Edit">
                <Button size="small" type="text" icon={<EditOutlined />} onClick={() => setEditing(row)} />
              </Tooltip>
            ) : null}
            <Dropdown menu={{ items: more }} trigger={["click"]} placement="bottomRight" disabled={more.length === 0}>
              <Button size="small" type="text" icon={<MoreOutlined />} aria-label={`More actions for ${row.number ?? "this invoice"}`} />
            </Dropdown>
          </Flex>
        );
      },
    },
  ];

  return (
    <>
      <PageTitle
        title="Invoices"
        description={`${outstanding.length > 0 ? `${outstanding.length} not paid. ` : ""}Invoices are made from accepted quotations — Convert to invoice in Quotations.`}
      />
      {error ? <Alert type="error" showIcon title="The invoices could not be loaded. Please reload the page." style={{ marginBottom: 16 }} /> : null}
      <Flex wrap gap={12} justify="space-between" style={{ marginBottom: 16 }}>
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "unpaid", label: "Not paid" },
            { value: "overdue", label: "Overdue" },
            { value: "paid", label: "Paid" },
            { value: "void", label: "Void" },
          ]}
        />
        <Input.Search allowClear placeholder="Search number, customer or quotation" onChange={(event) => setSearch(event.target.value)} style={{ maxWidth: 320 }} />
      </Flex>
      <Table<Row>
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={rows}
        pagination={{ pageSize: 25, hideOnSinglePage: true, showSizeChanger: false }}
        scroll={{ x: 860 }}
        locale={{ emptyText: data && data.length > 0 ? "Nothing matches." : "No invoices yet." }}
      />
      <InvoiceDetailsDrawer invoice={editing} onClose={() => setEditing(null)} />
    </>
  );
}

type DetailValues = {
  bill_to_name: string;
  bill_to_company: string;
  bill_to_email: string;
  bill_to_address: string;
  due_date: string;
  tax_rate: number;
  notes: string;
  refresh_seller: boolean;
  notify: boolean;
};

/**
 * Corrects an unpaid invoice: who pays, when, tax and notes. The lines are
 * what the customer accepted on the quotation and are not edited here; to
 * change what is sold, void the invoice, revise the quotation and convert again.
 */
function InvoiceDetailsDrawer({ invoice, onClose }: { invoice: Row | null; onClose: () => void }) {
  const [form] = Form.useForm<DetailValues>();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const taxRate = Form.useWatch("tax_rate", form);

  const { data: groups } = useQuery({
    queryKey: ["invoice-groups", invoice?.id],
    enabled: Boolean(invoice),
    queryFn: async () => (await supabase.from("invoice_groups").select("label, quantity, subtotal").eq("invoice_id", invoice!.id).order("position")).data ?? [],
  });

  if (!invoice) return <Drawer open={false} onClose={onClose} />;
  const money = (amount: number) => formatMoney(amount, invoice.currency, invoice.decimal_places);
  const scale = 10 ** invoice.decimal_places;
  const rate = Number(taxRate ?? invoice.tax_rate) || 0;
  const tax = Math.round(((Number(invoice.subtotal) * rate) / 100) * scale) / scale;

  const save = async (values: DetailValues) => {
    setPending(true);
    setError(null);
    const { error: saveError } = await supabase.rpc("update_invoice_details", {
      p_invoice_id: invoice.id,
      p_bill_to_name: values.bill_to_name,
      p_bill_to_company: values.bill_to_company ?? "",
      p_bill_to_email: values.bill_to_email || undefined,
      p_bill_to_address: values.bill_to_address ?? "",
      p_notes: values.notes ?? "",
      p_due_date: values.due_date,
      p_tax_rate: Number(values.tax_rate) || 0,
      p_refresh_seller: values.refresh_seller,
      p_notify: values.notify,
    });
    setPending(false);
    if (saveError) return setError(errorText(saveError, "The invoice could not be saved. Please try again."));
    await queryClient.invalidateQueries({ queryKey: ["invoices"] });
    message.success(values.notify ? "Invoice saved, and the customer has been emailed the update." : "Invoice saved.");
    onClose();
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={`Edit ${invoice.number ?? "invoice"}`}
      size={560}
      destroyOnHidden
      extra={
        <Button type="primary" loading={pending} onClick={() => form.submit()}>
          Save invoice
        </Button>
      }
    >
      <Typography.Paragraph type="secondary">
        {invoice.quotation_number
          ? `The lines are as accepted on quotation ${invoice.quotation_number}. To change what is sold, void this invoice, revise the quotation and convert it again.`
          : "The lines are as issued. Billing details, due date, tax and notes can be corrected."}
      </Typography.Paragraph>
      <Form<DetailValues>
        form={form}
        layout="vertical"
        requiredMark="optional"
        onFinish={save}
        disabled={pending}
        initialValues={{
          bill_to_name: invoice.bill_to_name,
          bill_to_company: invoice.bill_to_company ?? "",
          bill_to_email: invoice.bill_to_email ?? "",
          bill_to_address: invoice.bill_to_address ?? "",
          due_date: invoice.due_date,
          tax_rate: Number(invoice.tax_rate),
          notes: invoice.notes ?? "",
          refresh_seller: true,
          notify: true,
        }}
      >
        <Row gutter={16}>
          <Col span={24}>
            <Form.Item label="Invoiced to — name" name="bill_to_name" rules={[{ required: true, whitespace: true, message: "Enter who the invoice is to" }, { max: 200 }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item label="Company" name="bill_to_company" rules={[{ max: 200 }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item label="Billing email" name="bill_to_email" rules={[{ type: "email", message: "Enter a valid email" }]}>
              <Input />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item label="Billing address" name="bill_to_address" rules={[{ max: 500 }]}>
          <Input.TextArea rows={3} />
        </Form.Item>
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item label="Due date" name="due_date" rules={[{ required: true, message: "Choose a due date" }]}>
              <Input type="date" min={invoice.issue_date} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item label={`${invoice.tax_label} rate`} name="tax_rate" rules={[{ type: "number", min: 0, max: 100, message: "0 to 100" }]}>
              <InputNumber min={0} max={100} suffix="%" style={{ width: "100%" }} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item label="Notes on the invoice" name="notes" rules={[{ max: 1000 }]}>
          <Input.TextArea rows={3} />
        </Form.Item>
        <Form.Item name="refresh_seller" valuePropName="checked" style={{ marginBottom: 8 }}>
          <Checkbox>Use our current company and payment details</Checkbox>
        </Form.Item>
        <Form.Item name="notify" valuePropName="checked">
          <Checkbox>Email the customer that the invoice changed</Checkbox>
        </Form.Item>
      </Form>
      {error ? <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} /> : null}

      <Divider titlePlacement="start">What is invoiced</Divider>
      <Flex vertical gap={6}>
        {(groups ?? []).map((group, index) => (
          <Flex key={index} justify="space-between">
            <Typography.Text type="secondary">
              {group.label} × {group.quantity}
            </Typography.Text>
            <span>{money(Number(group.subtotal))}</span>
          </Flex>
        ))}
        <Flex justify="space-between">
          <Typography.Text type="secondary">Subtotal</Typography.Text>
          <span>{money(Number(invoice.subtotal))}</span>
        </Flex>
        <Flex justify="space-between">
          <Typography.Text type="secondary">
            {invoice.tax_label} ({rate}%)
          </Typography.Text>
          <span>{money(tax)}</span>
        </Flex>
        <Flex justify="space-between">
          <Typography.Text strong>Total</Typography.Text>
          <Typography.Text strong>{money(Number(invoice.subtotal) + tax)}</Typography.Text>
        </Flex>
      </Flex>
    </Drawer>
  );
}
