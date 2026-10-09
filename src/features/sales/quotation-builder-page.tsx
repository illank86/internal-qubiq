import { useState } from "react";
import { RichTextField } from "@/features/content/rich-text-field";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Affix, Alert, App, AutoComplete, Button, Card, Checkbox, Col, Collapse, Divider, Flex, Form, Input, InputNumber, Result, Row, Segmented, Select, Skeleton, Typography } from "antd";
import { DownloadOutlined, EyeOutlined, SafetyCertificateOutlined, SaveOutlined, SendOutlined } from "@ant-design/icons";
import { useStaff } from "@/auth/use-auth";
import { PageTitle } from "@/components/app-shell";
import { loadSalesCatalog, newGroup, priceGroups, errorText, type GroupDraft, type SalesCatalog } from "@/lib/sales";
import { supabase } from "@/lib/supabase";
import { newQuotationDraft, savedQuotationDraft, type QuotationDraft } from "./quotation-draft";
import { ServerGroupsEditor } from "./server-groups-editor";
import { renderQuotationPreview } from "./quotation-preview";
import { usePdfViewer } from "@/components/pdf-viewer-context";
import { EmailListInput, ccRules, normaliseEmails } from "@/components/email-list-input";
import { useIsApprover } from "./approvals";
import { quotationPdf } from "./api";

const CURRENCIES = ["USD", "IDR", "EUR", "SGD", "MYR", "AUD", "GBP", "JPY", "CNY", "THB", "PHP", "VND", "INR"];
const SOURCES = [
  { value: "phone", label: "Phone call" },
  { value: "email", label: "Email" },
  { value: "meeting", label: "Meeting or visit" },
  { value: "other", label: "Other" },
];

type Values = {
  source: QuotationDraft["source"];
  internal_note: string;
  contact_name: string;
  contact_email: string;
  cc_emails: string[];
  signature_mode: "digital" | "wet";
  company: string;
  job_title: string;
  phone: string;
  country: string;
  address: string;
  for_end_user: boolean;
  licensee_name: string;
  licensee_address: string;
  sales_profile_id: string;
  sales_name: string;
  sales_title: string;
  sales_email: string;
  sales_phone: string;
  valid_until: string;
  currency: string;
  exchange_rate: number | null;
  decimals: number;
  tax_rate: number;
  introduction: string;
  terms: string;
  closing: string;
  signoff: string;
};

/** /sales/quotations/new (?request= or ?license=) and /sales/quotations/:id/edit */
export function QuotationBuilderPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const staff = useStaff();
  const requestId = params.get("request");
  const licenseId = params.get("license");

  const catalog = useQuery({ queryKey: ["sales-catalog"], queryFn: loadSalesCatalog });
  const draft = useQuery({
    queryKey: ["quotation-draft", id ?? "new", requestId, licenseId],
    enabled: Boolean(catalog.data),
    queryFn: () => (id ? savedQuotationDraft(id) : newQuotationDraft(catalog.data!, staff.id, requestId, licenseId)),
    staleTime: Infinity,
    gcTime: 0,
  });

  if (catalog.isLoading || draft.isLoading) return <Skeleton active paragraph={{ rows: 12 }} />;
  if (catalog.error || draft.error) return <Result status="error" title="The quotation could not be loaded." />;
  if (!draft.data) return <Result status="404" title="Quotation not found" />;
  return <Builder catalog={catalog.data!} draft={draft.data} />;
}

function Builder({ catalog, draft }: { catalog: SalesCatalog; draft: QuotationDraft }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [form] = Form.useForm<Values>();
  const isApprover = useIsApprover();
  const viewPdf = usePdfViewer();
  const [groups, setGroups] = useState<GroupDraft[]>(() =>
    draft.groups.length > 0 ? draft.groups.map((group, index) => newGroup(catalog.editions, index, group)) : [newGroup(catalog.editions, 0)],
  );
  const [saving, setSaving] = useState<"save" | "send" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Currency, rate, decimals and tax are shared by every group.
  const currencyText = (Form.useWatch("currency", form) ?? draft.currency ?? "").trim().toUpperCase();
  const rateValue = Form.useWatch("exchange_rate", form) ?? draft.exchangeRate;
  const decimals = Form.useWatch("decimals", form) ?? draft.decimals;
  const taxRate = Form.useWatch("tax_rate", form) ?? draft.taxRate;
  const contactEmail = Form.useWatch("contact_email", form);
  const forEndUser = Form.useWatch("for_end_user", form) ?? draft.licensee.name !== "";
  // Signed by hand: an approver downloads it to sign; it goes out as the signed copy.
  const toSign = (Form.useWatch("signature_mode", form) ?? draft.signatureMode) === "wet";
  const sendLabel = isApprover ? (toSign ? "Save & download to sign" : draft.sent ? "Save & send again" : "Save & send to customer") : "Save & request approval";
  const firstEdition = catalog.editions.find((edition) => edition.id === groups.find((group) => group.editionId)?.editionId);
  const baseCurrency = firstEdition?.currency ?? catalog.editions[0]?.currency ?? "USD";
  const converting = /^[A-Z]{3}$/.test(currencyText) && currencyText !== baseCurrency;
  const rate = converting ? Number(rateValue) || 0 : 1;
  const currency = converting ? currencyText : baseCurrency;
  const totals = priceGroups(groups, catalog.editions, catalog.modules, { rate, decimals: Number(decimals) || 0, currency, taxRate: Number(taxRate) || 0 });
  const servers = groups.reduce((sum, group) => sum + group.quantity, 0);

  const pickSales = (profileId: string) => {
    const person = catalog.team.find((member) => member.id === profileId);
    form.setFieldsValue(
      person
        ? { sales_name: person.name, sales_title: person.title, sales_email: person.email || catalog.salesDesk.email, sales_phone: person.phone || catalog.salesDesk.phone }
        : { sales_name: "", sales_title: "", sales_email: catalog.salesDesk.email, sales_phone: catalog.salesDesk.phone },
    );
  };

  /** What is on screen, as the PDF would print it — nothing saved. */
  const previewInput = (values: Values) => ({
    number: draft.number,
    sent: draft.sent,
    groups,
    currency,
    baseCurrency,
    rate,
    decimals: Number(values.decimals) || 0,
    taxRate: Number(values.tax_rate) || 0,
    taxLabel: catalog.taxLabel,
    issueDate: new Date().toISOString().slice(0, 10),
    validUntil: values.valid_until,
    contact: {
      name: values.contact_name ?? "",
      email: values.contact_email ?? "",
      company: values.company ?? "",
      jobTitle: values.job_title ?? "",
      phone: values.phone ?? "",
      country: values.country ?? "",
      address: values.address ?? "",
    },
    sales: { name: values.sales_name ?? "", title: values.sales_title ?? "", email: values.sales_email ?? "", phone: values.sales_phone ?? "" },
    introduction: values.introduction ?? "",
    terms: values.terms ?? "",
    closing: values.closing ?? "",
    signoff: values.signoff ?? "",
    signatureMode: values.signature_mode ?? "digital",
    licensee: values.for_end_user ? { name: values.licensee_name ?? "", address: values.licensee_address ?? "" } : undefined,
  });

  const preview = (action?: { values: Values }) => {
    const values = action?.values ?? (form.getFieldsValue(true) as Values);
    viewPdf({
      title: `Quotation ${draft.number ?? "preview"}`,
      fileName: `${draft.number ?? "quotation-preview"}.pdf`,
      note: action
        ? isApprover && toSign
          ? "Check it. Approving saves it for signing: download it, sign it, then upload the signed copy to send it."
          : "Check it, and who it goes to, before sending."
        : "Preview of what is on screen — not saved yet.",
      recipients: action ? { to: values.contact_email, cc: normaliseEmails(values.cc_emails) } : undefined,
      make: () => renderQuotationPreview(catalog, previewInput(values)),
      action: action ? { label: isApprover ? (toSign ? "Approve & download to sign" : "Send to customer") : "Request approval", onClick: () => persist(action.values, "send") } : undefined,
    });
  };

  const save = async (intent: "save" | "send") => {
    setError(null);
    let values: Values;
    try {
      values = await form.validateFields();
    } catch {
      setError("Please check the highlighted fields.");
      return;
    }
    if (groups.some((group) => !group.editionId && group.moduleIds.length === 0)) {
      setError("Each server group needs an edition or at least one module.");
      return;
    }
    if (converting && !(Number(values.exchange_rate) > 0)) {
      form.setFields([{ name: "exchange_rate", errors: [`Enter how many ${currency} one ${baseCurrency} is worth`] }]);
      return;
    }
    if (intent === "send" && !values.contact_email) {
      form.setFields([{ name: "contact_email", errors: ["Needed to send the quotation"] }]);
      return;
    }
    // Sending shows the customer's PDF first; it goes out from there.
    if (intent === "send") return preview({ values });
    await persist(values, intent);
  };

  const persist = async (values: Values, intent: "save" | "send") => {
    setError(null);
    setSaving(intent);
    const opt = (value: string | undefined) => (value ?? "").trim() || undefined;
    const { data: quotationId, error: saveError } = await supabase.rpc("save_quotation", {
      p_quotation_id: draft.quotationId as string,
      p_quote_request_id: draft.quoteRequestId as string,
      p_groups: groups.map((group) => ({ label: group.label, edition_id: group.editionId || null, module_ids: group.moduleIds, quantity: group.quantity })),
      p_source: draft.quoteRequestId ? "website" : values.source,
      p_internal_note: values.internal_note ?? "",
      p_license_id: draft.licenseId ?? undefined,
      p_contact_name: values.contact_name.trim(),
      p_contact_email: opt(values.contact_email),
      p_company: opt(values.company),
      p_job_title: opt(values.job_title),
      p_phone: opt(values.phone),
      p_country: opt(values.country),
      p_address: opt(values.address),
      p_sales_profile_id: values.sales_profile_id || undefined,
      p_sales_name: opt(values.sales_name),
      p_sales_title: opt(values.sales_title),
      p_sales_email: opt(values.sales_email),
      p_sales_phone: opt(values.sales_phone),
      p_valid_until: values.valid_until,
      p_tax_rate: Number(values.tax_rate) || 0,
      p_currency: converting ? currency : undefined,
      p_exchange_rate: converting ? Number(values.exchange_rate) : undefined,
      p_decimals: Number(values.decimals),
      p_introduction: opt(values.introduction),
      p_terms: opt(values.terms),
      p_closing: (values.closing ?? "").trim(),
      p_signoff: opt(values.signoff),
    });
    if (saveError || !quotationId) {
      setSaving(null);
      setError(errorText(saveError, "The quotation could not be saved. Please try again."));
      return;
    }
    // Saved before sending, so the email (sent after commit) has the CC list.
    const { error: ccError } = await supabase
      .from("quotations")
      .update({
        cc_emails: normaliseEmails(values.cc_emails),
        signature_mode: values.signature_mode,
        // Empty: the licence is the customer's own.
        licensee_name: values.for_end_user ? opt(values.licensee_name) ?? null : null,
        licensee_address: values.for_end_user && opt(values.licensee_name) ? opt(values.licensee_address) ?? null : null,
      })
      .eq("id", quotationId);
    if (ccError) {
      setSaving(null);
      setError(`Saved, but the CC list was not: ${errorText(ccError, "check the addresses and save again.")}`);
      return;
    }
    let sent: string | null = null;
    if (intent === "send") {
      const { data: result, error: sendError } = await supabase.rpc("send_quotation", { p_quotation_id: quotationId });
      sent = result;
      if (sendError) {
        setSaving(null);
        setError(`Saved, but not sent: ${errorText(sendError, "please try again from the quotation list.")}`);
        return;
      }
    }
    await queryClient.invalidateQueries({ queryKey: ["quotations"] });
    if (sent === "to_sign") {
      message.success("Saved and approved. Download it, sign it, then upload the signed copy from the quotation.");
      navigate("/sales/quotations");
      viewPdf({ ...quotationPdf(quotationId, draft.number, { original: true }), note: "Print it and sign it by hand — then upload the signed copy from the quotation to send it." });
      return;
    }
    message.success(
      intent !== "send"
        ? "Quotation saved."
        : isApprover
          ? "Saved and sent. The customer has been emailed a link."
          : "Saved and sent for approval. The approvers have been emailed.",
    );
    navigate("/sales/quotations");
  };

  const initialValues: Values = {
    source: draft.source,
    internal_note: draft.internalNote,
    contact_name: draft.contact.name,
    contact_email: draft.contact.email,
    cc_emails: draft.cc,
    signature_mode: draft.signatureMode,
    company: draft.contact.company,
    job_title: draft.contact.jobTitle,
    phone: draft.contact.phone,
    country: draft.contact.country,
    address: draft.contact.address,
    for_end_user: Boolean(draft.licensee.name),
    licensee_name: draft.licensee.name,
    licensee_address: draft.licensee.address,
    sales_profile_id: draft.sales.profileId,
    sales_name: draft.sales.name,
    sales_title: draft.sales.title,
    sales_email: draft.sales.email,
    sales_phone: draft.sales.phone,
    valid_until: draft.validUntil,
    currency: draft.currency,
    exchange_rate: draft.exchangeRate,
    decimals: draft.decimals,
    tax_rate: draft.taxRate,
    introduction: draft.introduction,
    terms: draft.terms,
    closing: draft.closing,
    signoff: draft.signoff,
  };

  return (
    <>
      <PageTitle
        title={draft.quotationId ? `Edit ${draft.number ?? "quotation"}` : "New quotation"}
        description={
          draft.requestNote
            ? `For quote request ${draft.requestNote.reference}.`
            : draft.licenseId
              ? "For a licence request. Saving links that licence to this quotation."
              : draft.quotationId
                ? "Saving re-prices it from today's price list."
                : "For a request that came in by phone, email or in person. Start with who it is for."
        }
      />
      <Form<Values> form={form} layout="vertical" initialValues={initialValues} requiredMark="optional" disabled={saving !== null}>
        <Row gutter={24}>
          <Col xs={24} xl={16}>
            <Flex vertical gap={16}>
              {draft.requestNote ? (
                <Alert
                  type="info"
                  showIcon
                  title={`From quote request ${draft.requestNote.reference}`}
                  description={
                    <>
                      Prefilled from what they asked for on the website{draft.requestNote.total ? ` (shown to them as ${draft.requestNote.total})` : ""}. Prices below are today&rsquo;s.
                      {draft.requestNote.message ? <Typography.Paragraph style={{ margin: "8px 0 0" }}>&ldquo;{draft.requestNote.message}&rdquo;</Typography.Paragraph> : null}
                    </>
                  }
                />
              ) : null}

              <Card title="Prepared for">
                {draft.source !== "website" ? (
                  <Form.Item label="How did this request come in?" name="source">
                    <Segmented options={SOURCES} />
                  </Form.Item>
                ) : null}
                <Row gutter={16}>
                  <Col xs={24} md={12}>
                    <Form.Item label="Contact name" name="contact_name" rules={[{ required: true, whitespace: true, message: "Enter who the quotation is for" }, { max: 200 }]}>
                      <Input />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item label="Email" name="contact_email" extra="The quotation is sent here." rules={[{ type: "email", message: "Enter a valid email" }]}>
                      <Input />
                    </Form.Item>
                  </Col>
                  <Col xs={24}>
                    <Form.Item
                      label="CC"
                      name="cc_emails"
                      dependencies={["contact_email"]}
                      extra="Colleagues of the customer who should get a copy — a manager, purchasing. Paste several at once; up to 10."
                      rules={ccRules(() => form.getFieldValue("contact_email"))}
                    >
                      <EmailListInput exclude={contactEmail} placeholder="Add people to copy on the email" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item label="Company" name="company" rules={[{ max: 200 }]}>
                      <Input />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item label="Job title" name="job_title" rules={[{ max: 160 }]}>
                      <Input />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item label="Phone" name="phone" rules={[{ max: 40 }]}>
                      <Input />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item label="Country" name="country" rules={[{ max: 80 }]}>
                      <Input />
                    </Form.Item>
                  </Col>
                </Row>
                <Form.Item label="Address" name="address" rules={[{ max: 500 }]}>
                  <Input.TextArea rows={2} placeholder={"Street\nCity, postcode"} />
                </Form.Item>
                <div style={{ marginBottom: 16, padding: 16, borderRadius: 10, border: "1px solid var(--ant-color-border-secondary)" }}>
                  <Flex align="center" gap={8} style={{ marginBottom: 8 }}>
                    <SafetyCertificateOutlined style={{ color: "var(--ant-color-primary)" }} />
                    <Typography.Text strong>Licence issued to</Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {forEndUser ? "another company" : "the customer"}
                    </Typography.Text>
                  </Flex>
                  <Form.Item name="for_end_user" valuePropName="checked" style={{ marginBottom: forEndUser ? 12 : 0 }}>
                    <Checkbox>For another company — a reseller's or integrator's client, or another site</Checkbox>
                  </Form.Item>
                  {forEndUser ? (
                    <>
                      <Form.Item
                        label="Name"
                        name="licensee_name"
                        rules={[{ required: true, whitespace: true, message: "Enter who the licence is for" }, { max: 200 }]}
                        extra="Printed on the quotation and the invoice as who the licence is issued to."
                      >
                        <Input placeholder="Company or plant name" />
                      </Form.Item>
                      <Form.Item label="Address" name="licensee_address" rules={[{ max: 500 }]} style={{ marginBottom: 0 }}>
                        <Input.TextArea rows={2} />
                      </Form.Item>
                    </>
                  ) : null}
                </div>
                <Form.Item label="Internal note" name="internal_note" extra="Only the team sees this — never on the quotation or in emails." rules={[{ max: 4000 }]} style={{ marginBottom: 0 }}>
                  <Input.TextArea rows={2} />
                </Form.Item>
              </Card>

              <Card title="Servers">
                <ServerGroupsEditor
                  groups={groups}
                  onChange={setGroups}
                  editions={catalog.editions}
                  modules={catalog.modules}
                  subtotals={totals.priced.map((item) => item.subtotal)}
                  money={totals.money}
                />
              </Card>

              <Card title="Currency, tax and validity">
                <Row gutter={16}>
                  <Col xs={24} md={8}>
                    <Form.Item label="Quote in" name="currency" extra={`Leave empty for the price list's ${baseCurrency}.`}>
                      <AutoComplete options={CURRENCIES.map((code) => ({ value: code }))} placeholder={baseCurrency} allowClear filterOption={(input, option) => (option?.value ?? "").startsWith(input.toUpperCase())} />
                    </Form.Item>
                  </Col>
                  {/* The rate takes a column only while converting; hidden, it still keeps its value. */}
                  {converting ? (
                    <Col xs={24} md={8}>
                      <Form.Item label={`1 ${baseCurrency} =`} name="exchange_rate" extra={`How many ${currency} one ${baseCurrency} is worth.`}>
                        <InputNumber min={0} style={{ width: "100%" }} suffix={currency} />
                      </Form.Item>
                    </Col>
                  ) : (
                    <Form.Item name="exchange_rate" hidden>
                      <InputNumber />
                    </Form.Item>
                  )}
                  <Col xs={12} md={8}>
                    <Form.Item label="Decimal places" name="decimals">
                      <InputNumber min={0} max={4} style={{ width: "100%" }} />
                    </Form.Item>
                  </Col>
                  <Col xs={12} md={8}>
                    <Form.Item label={`${catalog.taxLabel} rate`} name="tax_rate" rules={[{ type: "number", min: 0, max: 100, message: "0 to 100" }]}>
                      <InputNumber min={0} max={100} style={{ width: "100%" }} suffix="%" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item label="Valid until" name="valid_until" rules={[{ required: true, message: "Enter a date" }]}>
                      <Input type="date" />
                    </Form.Item>
                  </Col>
                </Row>
              </Card>

              <Card title="Your contact — the salesperson">
                <Form.Item label="Contact" name="sales_profile_id">
                  <Select
                    onChange={pickSales}
                    options={[...catalog.team.map((member) => ({ value: member.id, label: member.title ? `${member.name} — ${member.title}` : member.name })), { value: "", label: "Someone else (type below)" }]}
                  />
                </Form.Item>
                <Row gutter={16}>
                  <Col xs={24} md={12}>
                    <Form.Item label="Name" name="sales_name">
                      <Input />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item label="Position" name="sales_title">
                      <Input />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item label="Email" name="sales_email" rules={[{ type: "email", message: "Enter a valid email" }]}>
                      <Input />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item label="Phone" name="sales_phone" style={{ marginBottom: 0 }}>
                      <Input />
                    </Form.Item>
                  </Col>
                </Row>
              </Card>

              <Card title="Introduction">
                <Form.Item name="introduction" rules={[{ max: 2000 }]} style={{ marginBottom: 0 }}>
                  <Input.TextArea rows={4} placeholder="Dear …" />
                </Form.Item>
              </Card>

              <Collapse
                items={[
                  {
                    key: "wording",
                    label: "Terms, closing and sign-off (defaults from Sales settings)",
                    children: (
                      <>
                        <Form.Item label="Terms and conditions" name="terms" rules={[{ max: 6000 }]}>
                          <RichTextField rows={8} />
                        </Form.Item>
                        <Form.Item label="Closing paragraph" name="closing" extra="{company} {name} {email} {phone} are filled in. Empty for none." rules={[{ max: 2000 }]}>
                          <Input.TextArea rows={3} />
                        </Form.Item>
                        <Form.Item label="Sign-off" name="signoff" rules={[{ max: 80 }]}>
                          <Input placeholder="Best regards," />
                        </Form.Item>
                        <Form.Item
                          label="Signature"
                          name="signature_mode"
                          style={{ marginBottom: 0 }}
                          extra="Digital: the company signature, added once approved (the QR code if none is on file). By hand: the space is left empty to sign on paper."
                        >
                          <Segmented
                            options={[
                              { value: "digital", label: "Digital" },
                              { value: "wet", label: "Sign by hand" },
                            ]}
                          />
                        </Form.Item>
                      </>
                    ),
                  },
                ]}
              />
            </Flex>
          </Col>

          <Col xs={24} xl={8}>
            <Affix offsetTop={80}>
              <Card title="Quotation preview" style={{ marginTop: 0 }}>
                <Flex vertical gap={8}>
                  {totals.priced.map(({ group, subtotal }) => (
                    <Flex key={group.key} justify="space-between" gap={12}>
                      <Typography.Text type="secondary" ellipsis>
                        {group.label || "Server group"} × {group.quantity}
                      </Typography.Text>
                      <span>{totals.money(subtotal)}</span>
                    </Flex>
                  ))}
                  <Divider style={{ margin: "4px 0" }} />
                  <Flex justify="space-between">
                    <Typography.Text type="secondary">Subtotal</Typography.Text>
                    <span>{totals.money(totals.subtotal)}</span>
                  </Flex>
                  <Flex justify="space-between">
                    <Typography.Text type="secondary">
                      {catalog.taxLabel} ({Number(taxRate) || 0}%)
                    </Typography.Text>
                    <span>{totals.money(totals.tax)}</span>
                  </Flex>
                  <Divider style={{ margin: "4px 0" }} />
                  <Flex justify="space-between">
                    <Typography.Text strong>Total</Typography.Text>
                    <Typography.Text strong style={{ fontSize: 18 }}>
                      {totals.money(totals.total)}
                    </Typography.Text>
                  </Flex>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {servers} server licence{servers === 1 ? "" : "s"} in {groups.length} group{groups.length === 1 ? "" : "s"}.
                    {converting && rate > 0 ? ` Converted at 1 ${baseCurrency} = ${rate.toLocaleString("en-US")} ${currency}.` : ""}
                  </Typography.Text>
                </Flex>
                {error ? <Alert type="error" showIcon title={error} style={{ marginTop: 16 }} /> : null}
                <Flex vertical gap={8} style={{ marginTop: 16 }}>
                  <Button type="primary" block size="large" icon={isApprover && toSign ? <DownloadOutlined /> : <SendOutlined />} loading={saving === "send"} onClick={() => save("send")}>
                    {sendLabel}
                  </Button>
                  <Button block icon={<EyeOutlined />} onClick={() => preview()}>
                    Preview PDF
                  </Button>
                  <Button block icon={<SaveOutlined />} loading={saving === "save"} onClick={() => save("save")}>
                    {draft.sent ? "Save without sending" : "Save draft"}
                  </Button>
                </Flex>
              </Card>
            </Affix>
          </Col>
        </Row>
      </Form>
    </>
  );
}
