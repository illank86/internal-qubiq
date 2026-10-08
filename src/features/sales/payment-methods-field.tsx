import { useState } from "react";
import { Button, Card, Col, Dropdown, Empty, Flex, Form, Input, Modal, Popconfirm, Row, Select, Tag, Tooltip, Typography, theme } from "antd";
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  BankOutlined,
  CreditCardOutlined,
  DeleteOutlined,
  EditOutlined,
  EllipsisOutlined,
  GlobalOutlined,
  PictureOutlined,
  PlusOutlined,
  QrcodeOutlined,
  WalletOutlined,
} from "@ant-design/icons";
import { useCan } from "@/auth/use-auth";
import { siteAsset } from "@/lib/env";
import { PAYMENT_KIND_LABEL, type PaymentMethod } from "@/lib/pdf-theme";
import { MediaPicker } from "@/features/content/media-picker";

type Kind = "bank" | "qris" | "ewallet" | "card" | "paypal" | "other";

const KINDS: { kind: Kind; icon: React.ReactNode; hint: string }[] = [
  { kind: "bank", icon: <BankOutlined />, hint: "Account number, bank, branch and SWIFT" },
  { kind: "qris", icon: <QrcodeOutlined />, hint: "A QRIS code to scan" },
  { kind: "ewallet", icon: <WalletOutlined />, hint: "GoPay, OVO, DANA, ShopeePay…" },
  { kind: "card", icon: <CreditCardOutlined />, hint: "A link to pay by card" },
  { kind: "paypal", icon: <GlobalOutlined />, hint: "A PayPal account or link" },
  { kind: "other", icon: <EllipsisOutlined />, hint: "Anything else, in your words" },
];
const ICON = Object.fromEntries(KINDS.map((entry) => [entry.kind, entry.icon])) as Record<string, React.ReactNode>;
const CURRENCIES = ["IDR", "USD", "SGD", "EUR", "AUD"];

/** Which fields a kind of method asks for, in order. */
const FIELDS: Record<Kind, (keyof PaymentMethod)[]> = {
  bank: ["bank_name", "account_name", "account_number", "branch", "swift"],
  qris: ["account_name", "qr_image"],
  ewallet: ["account_name", "account_number"],
  card: ["link"],
  paypal: ["account_number", "link"],
  other: ["link"],
};
const LABEL: Partial<Record<keyof PaymentMethod, string>> = {
  bank_name: "Bank",
  account_name: "Account name",
  account_number: "Account number",
  branch: "Branch",
  swift: "SWIFT / BIC",
  link: "Payment link",
  qr_image: "QR code image",
};
const PLACEHOLDER: Partial<Record<keyof PaymentMethod, string>> = {
  bank_name: "Bank Central Asia",
  account_name: "PT. QUBIQ Teknologi",
  account_number: "123 456 7890",
  branch: "KCU Margonda City",
  swift: "CENAIDJA",
  link: "https://…",
};

const describe = (method: PaymentMethod) =>
  [method.bank_name, method.account_number, method.account_name].filter(Boolean).join(" · ") || method.link || (method.qr_image ? "QR code" : "") || method.notes || "";

/**
 * The ways to pay printed on an invoice's How to pay page: a card each, in
 * this order. A method with a currency shows only on invoices in that
 * currency (so an IDR invoice lists the IDR accounts).
 */
export function PaymentMethodsField({ value, onChange }: { value?: PaymentMethod[] | null; onChange?: (next: PaymentMethod[]) => void }) {
  const { token } = theme.useToken();
  const methods = Array.isArray(value) ? value : [];
  const [editing, setEditing] = useState<{ index: number; method: PaymentMethod } | null>(null);
  const set = (next: PaymentMethod[]) => onChange?.(next);
  const move = (index: number, by: number) => {
    const next = [...methods];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item);
    set(next);
  };

  const add = (
    <Dropdown
      trigger={["click"]}
      menu={{
        items: KINDS.map((entry) => ({
          key: entry.kind,
          icon: entry.icon,
          label: (
            <Flex vertical>
              <span>{PAYMENT_KIND_LABEL[entry.kind]}</span>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {entry.hint}
              </Typography.Text>
            </Flex>
          ),
          onClick: () => setEditing({ index: -1, method: { kind: entry.kind, currency: "IDR" } }),
        })),
      }}
    >
      <Button icon={<PlusOutlined />} disabled={methods.length >= 12}>
        Add a way to pay
      </Button>
    </Dropdown>
  );

  return (
    <Flex vertical gap={10}>
      {methods.length === 0 ? (
        <Card size="small" style={{ borderStyle: "dashed" }}>
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No ways to pay yet. Invoices print the free-text note below instead." style={{ margin: 8 }}>
            {add}
          </Empty>
        </Card>
      ) : (
        <>
          <Row gutter={[10, 10]}>
            {methods.map((method, index) => (
              <Col key={index} xs={24} md={12}>
                <Card
                  size="small"
                  styles={{ body: { padding: 12 } }}
                  style={{ height: "100%", borderColor: token.colorBorderSecondary }}
                >
                  <Flex gap={12} align="flex-start">
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        display: "grid",
                        placeItems: "center",
                        fontSize: 18,
                        background: token.colorPrimaryBg,
                        color: token.colorPrimary,
                        flexShrink: 0,
                      }}
                    >
                      {ICON[method.kind] ?? ICON.other}
                    </div>
                    <Flex vertical style={{ flex: 1, minWidth: 0 }}>
                      <Flex gap={6} align="center" wrap>
                        <Typography.Text strong ellipsis>
                          {method.title || PAYMENT_KIND_LABEL[method.kind] || "Way to pay"}
                        </Typography.Text>
                        <Tag style={{ marginInlineEnd: 0 }}>{method.currency || "Any currency"}</Tag>
                      </Flex>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {PAYMENT_KIND_LABEL[method.kind] ?? "Other"}
                      </Typography.Text>
                      <Typography.Text style={{ fontSize: 12, marginTop: 2 }} ellipsis>
                        {describe(method) || "—"}
                      </Typography.Text>
                    </Flex>
                    <Flex vertical gap={2}>
                      <Flex gap={2}>
                        <Tooltip title="Edit">
                          <Button size="small" type="text" icon={<EditOutlined />} onClick={() => setEditing({ index, method })} aria-label="Edit" />
                        </Tooltip>
                        <Popconfirm title="Remove this way to pay?" okText="Remove" okButtonProps={{ danger: true }} onConfirm={() => set(methods.filter((_, at) => at !== index))}>
                          <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label="Remove" />
                        </Popconfirm>
                      </Flex>
                      <Flex gap={2}>
                        <Tooltip title="Earlier">
                          <Button size="small" type="text" icon={<ArrowUpOutlined />} disabled={index === 0} onClick={() => move(index, -1)} aria-label="Move earlier" />
                        </Tooltip>
                        <Tooltip title="Later">
                          <Button size="small" type="text" icon={<ArrowDownOutlined />} disabled={index === methods.length - 1} onClick={() => move(index, 1)} aria-label="Move later" />
                        </Tooltip>
                      </Flex>
                    </Flex>
                  </Flex>
                </Card>
              </Col>
            ))}
          </Row>
          <div>{add}</div>
        </>
      )}
      <MethodModal
        editing={editing}
        onCancel={() => setEditing(null)}
        onSave={(method) => {
          if (!editing) return;
          set(editing.index < 0 ? [...methods, method] : methods.map((item, at) => (at === editing.index ? method : item)));
          setEditing(null);
        }}
      />
    </Flex>
  );
}

function MethodModal({
  editing,
  onCancel,
  onSave,
}: {
  editing: { index: number; method: PaymentMethod } | null;
  onCancel: () => void;
  onSave: (method: PaymentMethod) => void;
}) {
  const [form] = Form.useForm<PaymentMethod>();
  const [picker, setPicker] = useState(false);
  const can = useCan();
  const kind = (editing?.method.kind ?? "other") as Kind;
  const qr = Form.useWatch("qr_image", form);
  const clean = (values: PaymentMethod): PaymentMethod => {
    const out: PaymentMethod = { kind };
    for (const [key, raw] of Object.entries(values)) {
      const text = typeof raw === "string" ? raw.trim() : raw;
      if (text) (out as Record<string, unknown>)[key] = key === "currency" ? String(text).toUpperCase() : text;
    }
    return out;
  };

  return (
    <Modal
      open={editing !== null}
      title={`${editing && editing.index >= 0 ? "Edit" : "Add"} · ${PAYMENT_KIND_LABEL[kind] ?? "Way to pay"}`}
      okText={editing && editing.index >= 0 ? "Save" : "Add"}
      onCancel={onCancel}
      onOk={async () => onSave(clean(await form.validateFields()))}
      destroyOnHidden
      width={560}
    >
      {editing ? (
        <Form<PaymentMethod> form={form} layout="vertical" requiredMark="optional" initialValues={editing.method} preserve={false}>
          <Row gutter={12}>
            <Col xs={24} sm={16}>
              <Form.Item
                label="Title"
                name="title"
                rules={[{ required: true, whitespace: true, message: "Name it as the customer should read it" }, { max: 80 }]}
                extra="As printed, e.g. Bank BCA (IDR), QRIS, GoPay."
              >
                <Input placeholder={kind === "bank" ? "Bank BCA" : PAYMENT_KIND_LABEL[kind]} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item label="Currency" name="currency" extra="Shown on invoices in it.">
                <Select allowClear placeholder="Any" options={CURRENCIES.map((value) => ({ value, label: value }))} />
              </Form.Item>
            </Col>
            {FIELDS[kind].map((field) =>
              field === "qr_image" ? (
                <Col span={24} key={field}>
                  <Form.Item
                    label={LABEL[field]}
                    name={field}
                    rules={[{ required: true, message: "Add the QR image" }, { type: "url", message: "A full link to the image" }]}
                    extra={can("content.manage") ? "Pick it from the media library, or paste a link to the image." : "Paste a link to the image (PNG or JPEG)."}
                  >
                    <Input placeholder="https://…/qris.png" />
                  </Form.Item>
                  {can("content.manage") ? (
                    <Button size="small" icon={<PictureOutlined />} onClick={() => setPicker(true)} style={{ marginTop: -12, marginBottom: 12 }}>
                      Choose from media library
                    </Button>
                  ) : null}
                  {qr ? (
                    <div style={{ marginTop: -8, marginBottom: 16 }}>
                      <img src={siteAsset(qr)} alt="QR code preview" style={{ width: 120, height: 120, objectFit: "contain", border: "1px solid rgba(127,127,127,0.25)", borderRadius: 8, background: "#fff" }} />
                    </div>
                  ) : null}
                </Col>
              ) : (
                <Col xs={24} sm={field === "account_number" || field === "link" ? 24 : 12} key={field}>
                  <Form.Item
                    label={field === "account_number" && kind === "paypal" ? "PayPal email" : field === "account_number" && kind === "ewallet" ? "Number" : LABEL[field]}
                    name={field}
                    rules={[
                      { max: field === "link" ? 300 : 120 },
                      ...(field === "link" ? [{ type: "url" as const, message: "A full link, starting with https://" }] : []),
                      ...(kind === "bank" && field === "account_number" ? [{ required: true, message: "The account number" }] : []),
                    ]}
                  >
                    <Input placeholder={PLACEHOLDER[field]} style={field === "account_number" ? { fontFamily: "Geist Mono, monospace" } : undefined} />
                  </Form.Item>
                </Col>
              ),
            )}
            <Col span={24}>
              <Form.Item label="Note" name="notes" rules={[{ max: 300 }]} extra="Printed small under the details, e.g. Use BI-FAST or RTGS from other banks.">
                <Input.TextArea rows={2} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      ) : null}
      <MediaPicker
        open={picker}
        accept="image"
        onClose={() => setPicker(false)}
        onPick={(asset) => {
          form.setFieldValue("qr_image", siteAsset(asset.url));
          setPicker(false);
        }}
      />
    </Modal>
  );
}
