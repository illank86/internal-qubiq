import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, App, Button, Checkbox, Col, Drawer, Empty, Flex, Form, Input, InputNumber, Row, Segmented, Select, Skeleton, Typography, theme } from "antd";
import { EditOutlined, QrcodeOutlined, SafetyCertificateOutlined, SendOutlined } from "@ant-design/icons";
import { EmailListInput, ccRules, normaliseEmails } from "@/components/email-list-input";
import { usePdfViewer } from "@/components/pdf-viewer-context";
import { useStaff } from "@/auth/use-auth";
import { errorText } from "@/lib/sales";
import { supabase } from "@/lib/supabase";
import {
  METHOD_LABEL,
  createDeliveryOrder,
  deliveryOrderPdf,
  issueDeliveryOrder,
  licenceIssued,
  loadRemaining,
  updateDeliveryOrder,
  type DeliveryDetails,
  type DeliveryMethod,
  type DeliveryOrder,
  type DeliverySignature,
} from "./delivery-api";

type Values = Required<Omit<DeliveryDetails, "delivery_date">> & { delivery_date: string };

const today = () => new Date().toISOString().slice(0, 10);

/**
 * A delivery order for a paid invoice: what goes out this time (all of it, or
 * part — the rest stays to deliver later), how and to whom, and how it is
 * signed. Saved as a draft, or issued at once (it is then emailed).
 */
export function DeliveryOrderEditor({
  invoiceId,
  order,
  open,
  onClose,
  onSaved,
}: {
  /** New: the invoice it delivers. */
  invoiceId?: string | null;
  /** Edit: a draft. */
  order?: DeliveryOrder | null;
  open: boolean;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const sourceId = order?.invoice_id ?? invoiceId ?? null;
  const { token } = theme.useToken();
  const [form] = Form.useForm<Values>();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const viewPdf = usePdfViewer();
  const [pending, setPending] = useState<"draft" | "issue" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number> | null>(null);
  const contactEmail = Form.useWatch("contact_email", form);
  const signature = Form.useWatch("signature_mode", form) ?? "qr";
  const same = Form.useWatch("delivered_by_same", form) ?? Boolean(order?.delivered_by_same);
  const me = useStaff().profile?.full_name?.trim() ?? "";

  const { data, isLoading } = useQuery({
    queryKey: ["delivery-editor", sourceId, order?.id ?? "new"],
    enabled: open && Boolean(sourceId),
    queryFn: async () => {
      const [{ data: invoice, error: invoiceError }, remaining, own, licensed] = await Promise.all([
        supabase
          .from("invoices")
          .select("id, number, status, po_number, quotation_number, bill_to_name, bill_to_company, bill_to_email, bill_to_address, licensee_name, licensee_address, cc_emails")
          .eq("id", sourceId!)
          .maybeSingle(),
        loadRemaining(sourceId!),
        order ? supabase.from("delivery_order_items").select("invoice_group_id, quantity").eq("delivery_order_id", order.id) : Promise.resolve({ data: [] }),
        licenceIssued(sourceId!),
      ]);
      if (invoiceError) throw invoiceError;
      // Editing a draft: what it already delivers is still "left" for it.
      const mine = new Map<string, number>();
      for (const item of (own.data ?? []) as { invoice_group_id: string | null; quantity: number }[]) {
        if (item.invoice_group_id) mine.set(item.invoice_group_id, (mine.get(item.invoice_group_id) ?? 0) + Number(item.quantity));
      }
      const groups = remaining.map((group) => ({ ...group, left: group.remaining + (mine.get(group.invoice_group_id) ?? 0), mine: mine.get(group.invoice_group_id) ?? 0 }));
      return { invoice, groups, licensed };
    },
  });

  const invoice = data?.invoice;
  const groups = data?.groups ?? [];
  // A new DO starts with everything still to deliver; a draft with what it has.
  const qty = quantities ?? Object.fromEntries(groups.map((group) => [group.invoice_group_id, order ? group.mine : group.left]));
  const totalChosen = Object.values(qty).reduce((sum, value) => sum + (Number(value) || 0), 0);
  const nothingLeft = groups.length > 0 && groups.every((group) => group.left <= 0);

  const initialValues: Partial<Values> | undefined = invoice
    ? order
      ? {
          method: order.method as DeliveryMethod,
          delivery_date: order.delivery_date ?? today(),
          ship_to_name: order.ship_to_name,
          ship_to_company: order.ship_to_company ?? "",
          ship_to_address: order.ship_to_address ?? "",
          contact_name: order.contact_name ?? "",
          contact_email: order.contact_email ?? "",
          contact_phone: order.contact_phone ?? "",
          cc_emails: order.cc_emails ?? [],
          software_version: order.software_version ?? "",
          notes: order.notes ?? "",
          signature_mode: order.signature_mode as DeliverySignature,
          prepared_by_name: order.prepared_by_name ?? "",
          prepared_by_title: order.prepared_by_title ?? "",
          delivered_by_name: order.delivered_by_name ?? "",
          delivered_by_title: order.delivered_by_title ?? "",
          delivered_by_same: order.delivered_by_same,
        }
      : {
          method: "download",
          delivery_date: today(),
          ship_to_name: invoice.licensee_name?.trim() || invoice.bill_to_name,
          ship_to_company: invoice.bill_to_company ?? "",
          ship_to_address: invoice.licensee_address?.trim() || invoice.bill_to_address || "",
          contact_name: invoice.bill_to_name,
          contact_email: invoice.bill_to_email ?? "",
          contact_phone: "",
          cc_emails: invoice.cc_emails ?? [],
          software_version: "",
          notes: "",
          signature_mode: "qr",
          prepared_by_name: me,
          prepared_by_title: "",
          delivered_by_name: "",
          delivered_by_title: "",
          delivered_by_same: false,
        }
    : undefined;

  const submit = async (issue: boolean) => {
    let values: Values;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    const lines = groups.map((group) => ({ invoice_group_id: group.invoice_group_id, quantity: Number(qty[group.invoice_group_id]) || 0 })).filter((line) => line.quantity > 0);
    if (lines.length === 0) return setError("Choose at least one server to deliver.");
    if (issue && !values.contact_email) return setError("Add the email of who receives it — the delivery order is emailed to them.");
    setPending(issue ? "issue" : "draft");
    setError(null);
    const details: DeliveryDetails = {
      ...values,
      cc_emails: normaliseEmails(values.cc_emails),
      ...(values.delivered_by_same ? { delivered_by_name: values.prepared_by_name, delivered_by_title: values.prepared_by_title } : {}),
    };
    try {
      let id = order?.id ?? null;
      if (id) await updateDeliveryOrder(id, lines, details);
      else id = await createDeliveryOrder(sourceId!, lines, details);
      if (issue) await issueDeliveryOrder(id);
      await Promise.all(["delivery-orders", "invoice-deliveries", "history", "order-overview"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
      message.success(issue ? `Issued and emailed to ${values.contact_email}.` : "Saved as a draft.");
      onSaved?.(id);
      onClose();
    } catch (cause) {
      setError(errorText(cause as { code?: string; message?: string }, "The delivery order could not be saved. Please try again."));
    } finally {
      setPending(null);
    }
  };

  const signatureHelp: Record<DeliverySignature, string> = {
    qr: "A QR code anyone can scan to check the delivery order is genuine. No signature image.",
    digital: "The company signature, printed once it is issued.",
    wet: "The space is left empty: print it and sign by hand.",
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      destroyOnHidden
      size={760}
      title={order ? `Edit delivery order ${order.number ?? ""}`.trim() : `New delivery order${invoice?.number ? ` · ${invoice.number}` : ""}`}
      extra={
        <Flex gap={8}>
          {order ? (
            <Button icon={<EditOutlined />} onClick={() => viewPdf({ ...deliveryOrderPdf(order), note: "The saved draft — save first to see your changes." })}>
              Preview
            </Button>
          ) : null}
          <Button loading={pending === "draft"} disabled={Boolean(pending) || !invoice || nothingLeft} onClick={() => submit(false)}>
            Save draft
          </Button>
          <Button
            type="primary"
            icon={<SendOutlined />}
            loading={pending === "issue"}
            disabled={Boolean(pending) || !invoice || nothingLeft || !data?.licensed}
            title={data && !data.licensed ? "Issue the licence first" : undefined}
            onClick={() => submit(true)}
          >
            Save & issue
          </Button>
        </Flex>
      }
    >
      {isLoading || (open && !data) ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : !invoice ? (
        <Empty description="That invoice could not be found." />
      ) : (
        <Flex vertical gap={20}>
          <Typography.Text type="secondary">
            For invoice <Typography.Text strong>{invoice.number}</Typography.Text>
            {invoice.po_number ? ` · PO ${invoice.po_number}` : ""}
            {invoice.quotation_number ? ` · quotation ${invoice.quotation_number}` : ""}
          </Typography.Text>
          {invoice.status !== "paid" ? (
            <Alert type="warning" showIcon title={`Invoice ${invoice.number} is not paid`} description="A delivery order goes out only for a paid invoice. Mark it paid first." />
          ) : !data?.licensed ? (
            <Alert
              type="warning"
              showIcon
              title="The licence has not been issued yet"
              description="Issue and send the licence in Licences first. You can save this as a draft now and issue it once the licence is sent."
            />
          ) : null}

          <section>
            <Typography.Text strong style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>
              What is delivered
            </Typography.Text>
            <Typography.Paragraph type="secondary" style={{ fontSize: 13, margin: "4px 0 10px" }}>
              All of it, or part — whatever is left can go on another delivery order later.
            </Typography.Paragraph>
            {nothingLeft ? (
              <Alert type="success" showIcon title="Everything on this invoice has been delivered." />
            ) : (
              <div style={{ border: `1px solid ${token.colorBorderSecondary}`, borderRadius: token.borderRadiusLG }}>
                {groups.map((group, index) => (
                  <Flex
                    key={group.invoice_group_id}
                    gap={16}
                    align="center"
                    justify="space-between"
                    style={{ padding: "12px 16px", borderTop: index ? `1px solid ${token.colorBorderSecondary}` : undefined }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <Typography.Text strong>{group.label}</Typography.Text>
                      {group.detail ? (
                        <Typography.Text type="secondary" style={{ display: "block", fontSize: 12 }} ellipsis={{ tooltip: group.detail }}>
                          {group.detail}
                        </Typography.Text>
                      ) : null}
                      <Typography.Text type="secondary" style={{ display: "block", fontSize: 12 }}>
                        {group.quantity} ordered · {group.delivered - group.mine} delivered before · {group.left} left
                      </Typography.Text>
                    </div>
                    <InputNumber
                      min={0}
                      max={group.left}
                      precision={0}
                      disabled={group.left <= 0}
                      value={qty[group.invoice_group_id]}
                      onChange={(value) => setQuantities({ ...qty, [group.invoice_group_id]: Number(value) || 0 })}
                      suffix="servers"
                      style={{ width: 140, flexShrink: 0 }}
                      aria-label={`Servers of ${group.label} to deliver`}
                    />
                  </Flex>
                ))}
                <Flex justify="space-between" style={{ padding: "10px 16px", background: token.colorFillQuaternary, borderTop: `1px solid ${token.colorBorderSecondary}` }}>
                  <Typography.Text type="secondary">On this delivery order</Typography.Text>
                  <Typography.Text strong>
                    {totalChosen} server{totalChosen === 1 ? "" : "s"}
                  </Typography.Text>
                </Flex>
              </div>
            )}
          </section>

          <Form<Values> form={form} layout="vertical" requiredMark="optional" initialValues={initialValues} disabled={Boolean(pending)}>
            <Row gutter={16}>
              <Col xs={24} sm={12}>
                <Form.Item label="Delivery method" name="method" rules={[{ required: true }]}>
                  <Select options={Object.entries(METHOD_LABEL).map(([value, label]) => ({ value, label }))} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item label="Delivery date" name="delivery_date" rules={[{ required: true, message: "Choose the delivery date" }]}>
                  <Input type="date" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item label="Software version" name="software_version" rules={[{ max: 60 }]} extra="Optional, e.g. 4.2.0">
                  <Input />
                </Form.Item>
              </Col>
            </Row>

            <Typography.Text strong style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1, display: "block", margin: "4px 0 12px" }}>
              Deliver to
            </Typography.Text>
            <Row gutter={16}>
              <Col xs={24} sm={12}>
                <Form.Item label="Name" name="ship_to_name" rules={[{ required: true, whitespace: true, message: "Enter who it is delivered to" }, { max: 200 }]}>
                  <Input />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item label="Company" name="ship_to_company" rules={[{ max: 200 }]}>
                  <Input />
                </Form.Item>
              </Col>
              <Col span={24}>
                <Form.Item label="Address" name="ship_to_address" rules={[{ max: 500 }]}>
                  <Input.TextArea rows={2} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item label="Receiver" name="contact_name" rules={[{ max: 200 }]}>
                  <Input />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item label="Receiver's email" name="contact_email" rules={[{ type: "email", message: "Enter a valid email" }, { max: 254 }]} extra="Gets the DO and the confirm link.">
                  <Input />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item label="Phone" name="contact_phone" rules={[{ max: 60 }]}>
                  <Input />
                </Form.Item>
              </Col>
              <Col span={24}>
                <Form.Item label="CC" name="cc_emails" dependencies={["contact_email"]} rules={ccRules(() => form.getFieldValue("contact_email"))}>
                  <EmailListInput exclude={contactEmail} placeholder="Add people to copy, e.g. it@customer.com" />
                </Form.Item>
              </Col>
              <Col span={24}>
                <Form.Item label="Notes on the delivery order" name="notes" rules={[{ max: 2000 }]}>
                  <Input.TextArea rows={3} />
                </Form.Item>
              </Col>
            </Row>

            <Typography.Text strong style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1, display: "block", margin: "4px 0 12px" }}>
              Our signatures
            </Typography.Text>
            <Row gutter={16}>
              <Col xs={24} sm={12}>
                <Form.Item
                  label="Prepared by — name"
                  name="prepared_by_name"
                  rules={[{ max: 200 }]}
                  extra={signature === "digital" ? "With a digital signature, the signatory's name and position are printed." : undefined}
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
                  <Form.Item label="Delivered by — name" name="delivered_by_name" rules={[{ max: 200 }]} extra="Who hands it over, e.g. the engineer on site.">
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
            <Form.Item label="How we sign it" name="signature_mode" extra={signatureHelp[signature as DeliverySignature]} style={{ marginBottom: 0 }}>
              <Segmented<DeliverySignature>
                block
                options={[
                  { value: "qr", label: "QR code", icon: <QrcodeOutlined /> },
                  { value: "digital", label: "Digital signature", icon: <SafetyCertificateOutlined /> },
                  { value: "wet", label: "By hand", icon: <EditOutlined /> },
                ]}
              />
            </Form.Item>
          </Form>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            The customer signs “Received by” — online from the email, or on paper. A signed copy or BAST is uploaded to the delivery order afterwards.
          </Typography.Text>
          {error ? <Alert type="error" showIcon title={error} /> : null}
        </Flex>
      )}
    </Drawer>
  );
}
