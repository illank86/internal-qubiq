import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, App, Button, Card, Col, Descriptions, Flex, Form, Input, Result, Row, Segmented, Skeleton, Typography } from "antd";
import { DownloadOutlined, FileProtectOutlined, TransactionOutlined } from "@ant-design/icons";
import { PageTitle } from "@/components/app-shell";
import { EmailListInput, Recipients, ccRules, normaliseEmails } from "@/components/email-list-input";
import { formatMoney } from "@/lib/invoices";
import { errorText } from "@/lib/sales";
import { supabase } from "@/lib/supabase";
import { invoicePdf, removeStoredPurchaseOrder, storePurchaseOrder, type Materai, type SignatureMode } from "./api";
import { PurchaseOrderField, type PurchaseOrderChange } from "./purchase-order-field";
import { usePdfViewer } from "@/components/pdf-viewer-context";
import { useIsApprover } from "./approvals";
import { needsMateraiHint } from "./invoices-page";
import { AccountPicker } from "./account-picker";
import { loadCustomerAccounts } from "./accounts";

/**
 * Turns an accepted quotation into an invoice for the quotation's customer
 * account. A linked quotation has nothing to choose; an unlinked one offers
 * its customer accounts, or "no account yet" — the invoice then waits and
 * moves in when the quotation is claimed. Licences are not picked here: each
 * links to the invoice through its order line.
 */
export function ConvertPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const viewPdf = usePdfViewer();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [picked, setPicked] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ccForm] = Form.useForm<{ cc: string[] }>();
  const [materai, setMaterai] = useState<Materai>("none");
  const [signatureMode, setSignatureMode] = useState<SignatureMode>("digital");
  const [poNumber, setPoNumber] = useState("");
  const [poChange, setPoChange] = useState<PurchaseOrderChange>({ kind: "keep" });
  const isApprover = useIsApprover();

  const { data, isLoading } = useQuery({
    queryKey: ["convert", id],
    queryFn: async () => {
      const { data: quotation, error: loadError } = await supabase.from("quotations").select("*, invoices(id, number, status)").eq("id", id).maybeSingle();
      if (loadError) throw loadError;
      if (!quotation) return null;
      const [{ data: groups }, accounts] = await Promise.all([
        supabase.from("quotation_groups").select("id, label, quantity, subtotal").eq("quotation_id", id).order("position"),
        loadCustomerAccounts(() =>
          quotation.customer_id
            ? supabase.from("profiles").select("id, full_name, email, company").eq("id", quotation.customer_id)
            : supabase.from("profiles").select("id, full_name, email, company").eq("user_type", "external").order("created_at", { ascending: false }).limit(2000),
        ),
      ]);
      return { quotation, groups: groups ?? [], accounts };
    },
  });

  if (isLoading) return <Skeleton active />;
  if (!data) return <Result status="404" title="Quotation not found" />;
  const { quotation, groups, accounts } = data;
  const invoice = (quotation.invoices as unknown as { id: string; number: string; status: string }[]).find((candidate) => candidate.status !== "void");
  const money = (amount: number | string) => formatMoney(amount, quotation.currency, quotation.decimal_places);
  const linked = quotation.customer_id ? accounts.find((account) => account.id === quotation.customer_id) : undefined;
  const email = (quotation.contact_email ?? "").toLowerCase();
  const suggested = accounts.find((account) => email && account.email.toLowerCase() === email)?.id ?? "";
  const choice = picked ?? suggested;
  // Who the "invoice ready" email goes to: the account holder, or with no
  // account yet, the quotation's contact.
  const recipient = linked?.email ?? (choice ? accounts.find((account) => account.id === choice)?.email : null) ?? quotation.contact_email ?? "";

  const title = `Convert ${quotation.number ?? ""} to an invoice`;
  const blocked = invoice
    ? `Already converted to invoice ${invoice.number}.`
    : quotation.status !== "accepted"
      ? "Only an accepted quotation can be converted. Mark it accepted in the quotation list first."
      : null;
  if (blocked) {
    return (
      <>
        <PageTitle title={title} />
        <Result status="info" title={blocked} extra={<Button onClick={() => navigate(invoice ? "/sales/invoices" : "/sales/quotations")}>{invoice ? "Open invoices" : "Back to quotations"}</Button>} />
      </>
    );
  }

  // Signed by hand or with materai: an approver downloads it to sign; it is sent once the signed copy is uploaded.
  const toSign = signatureMode === "wet" || materai !== "none";

  const convert = async () => {
    let cc: string[];
    try {
      cc = normaliseEmails((await ccForm.validateFields()).cc);
    } catch {
      return;
    }
    if (poNumber.trim().length > 60) return setError("The PO number can be 60 characters at most.");
    setPending(true);
    setError(null);
    // The PO goes up first, under the quotation, so the invoice is created with it.
    let po: { path: string; name: string } | null = null;
    if (poChange.kind === "replace") {
      try {
        po = await storePurchaseOrder({ quotationId: quotation.id }, poChange.file);
      } catch (cause) {
        setPending(false);
        return setError(errorText(cause as { code?: string; message?: string }, "The purchase order could not be uploaded. Please try again."));
      }
    }
    const { data: invoiceId, error: convertError } = await supabase.rpc("convert_quotation_to_invoice", {
      p_quotation_id: quotation.id,
      // Linked, or "no account yet": the database uses the quotation's own account (or none).
      ...(linked || !choice ? {} : { p_owner_id: choice }),
      p_cc_emails: cc,
      p_signature_mode: signatureMode,
      p_materai: materai,
      p_po_number: poNumber.trim() || undefined,
      p_po_path: po?.path,
      p_po_file_name: po?.name,
    });
    if (convertError) {
      if (po) await removeStoredPurchaseOrder(po.path);
      setPending(false);
      return setError(errorText(convertError, "The invoice could not be created. Please try again."));
    }
    setPending(false);
    await Promise.all(["quotations", "invoices"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
    if (isApprover && toSign && invoiceId) {
      // Approved, not sent: it goes out as the signed (or stamped) copy.
      message.success("Invoice created and approved. Download it, sign or stamp it, then upload the signed copy.");
      navigate(`/sales/invoices?invoice=${invoiceId}`);
      viewPdf({ ...invoicePdf(invoiceId, null, { original: true }), note: "Print and sign it, or stamp it on your e-Meterai provider's site — then upload the signed copy from the invoice." });
      return;
    }
    message.success(isApprover ? "Invoice created and sent to the customer." : "Invoice created and sent for approval. The approvers have been emailed.");
    navigate("/sales/invoices");
  };

  return (
    <>
      <PageTitle
        title={title}
        description={`${quotation.company || quotation.contact_name} · ${money(quotation.total)} · the invoice copies the accepted lines and totals exactly.`}
      />
      <Flex vertical gap={16} style={{ maxWidth: 960 }}>
        <Card size="small" title="What is invoiced">
          <Flex vertical gap={8}>
            {groups.map((group) => (
              <Flex key={group.id} justify="space-between" gap={12}>
                <span>
                  {group.label}
                  <Typography.Text type="secondary">
                    {" "}
                    · {group.quantity} server{group.quantity === 1 ? "" : "s"}
                  </Typography.Text>
                </span>
                <Typography.Text strong>{money(group.subtotal)}</Typography.Text>
              </Flex>
            ))}
          </Flex>
          <Typography.Paragraph type="secondary" style={{ margin: "8px 0 0", fontSize: 12 }}>
            Licences link to it by themselves: each fingerprint the customer uploads is requested against one of these order lines.
          </Typography.Paragraph>
        </Card>

        <Card title="Invoice it to">
          {quotation.customer_id ? (
            linked ? (
              <Descriptions column={1} size="small" bordered>
                <Descriptions.Item label="Account">{linked.name}</Descriptions.Item>
                <Descriptions.Item label="Email">{linked.email}</Descriptions.Item>
                {linked.company ? <Descriptions.Item label="Company">{linked.company}</Descriptions.Item> : null}
              </Descriptions>
            ) : (
              <Alert type="warning" showIcon title="The linked customer account could not be found." action={<Button size="small" onClick={() => navigate(`/sales/quotations/${quotation.id}/customer`)}>Check it</Button>} />
            )
          ) : (
            <AccountPicker
              accounts={accounts}
              value={choice}
              onChange={setPicked}
              matchEmail={quotation.contact_email ?? ""}
              noneLabel={
                <span>
                  <Typography.Text strong>No account yet — awaiting customer account.</Typography.Text>{" "}
                  <Typography.Text type="secondary">
                    Emailed to {quotation.contact_email || "the quotation contact"} with the PDF and the claim link; it moves into their account when they claim the quotation.
                  </Typography.Text>
                </span>
              }
            />
          )}
          {quotation.customer_id ? (
            <Typography.Paragraph type="secondary" style={{ margin: "12px 0 0", fontSize: 12 }}>
              The quotation&rsquo;s customer account. To invoice someone else, change the quotation&rsquo;s customer account first.
            </Typography.Paragraph>
          ) : null}
        </Card>

        <Card
          title={
            <Flex align="center" gap={8}>
              <FileProtectOutlined style={{ color: "var(--ant-color-primary)" }} />
              Customer's purchase order
              <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>
                optional
              </Typography.Text>
            </Flex>
          }
        >
          <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
            If the customer sent a PO, its number goes on the invoice next to the quotation reference. The PO document is shown after the invoice when the customer opens it — never attached to the email.
          </Typography.Paragraph>
          <Row gutter={[16, 16]}>
            <Col span={24}>
              <Form layout="vertical" component="div">
                <Form.Item label="PO number" style={{ marginBottom: 0 }} validateStatus={poNumber.trim().length > 60 ? "error" : undefined} help={poNumber.trim().length > 60 ? "60 characters at most" : undefined}>
                  <Input value={poNumber} onChange={(event) => setPoNumber(event.target.value)} placeholder="e.g. PO-2026-0412" allowClear disabled={pending} />
                </Form.Item>
              </Form>
            </Col>
            <Col span={24}>
              <Form layout="vertical" component="div">
                <Form.Item label="PO document" style={{ marginBottom: 0 }}>
                  <PurchaseOrderField current={null} change={poChange} onChange={setPoChange} disabled={pending} />
                </Form.Item>
              </Form>
            </Col>
          </Row>
        </Card>

        <Card title="Who is emailed">
          <Flex vertical gap={16}>
            {recipient ? (
              <Recipients to={recipient} />
            ) : (
              <Alert type="warning" showIcon title="There is no email address to send the invoice to." />
            )}
            <Form form={ccForm} layout="vertical" initialValues={{ cc: quotation.cc_emails ?? [] }} requiredMark={false}>
              <Form.Item
                label="CC"
                name="cc"
                style={{ marginBottom: 0 }}
                extra={
                  quotation.cc_emails?.length
                    ? "Copied from the quotation. Everyone here also gets the payment-received email, and any update you send."
                    : "Anyone else who should get the invoice — their accounts or finance team. They also get the payment-received email."
                }
                rules={ccRules(() => recipient)}
              >
                <EmailListInput exclude={recipient} placeholder="Add people to copy, e.g. accounts@customer.com" />
              </Form.Item>
            </Form>
          </Flex>
        </Card>

        <Card title="Signing">
          <Flex vertical gap={12}>
            <Typography.Text strong>Signature</Typography.Text>
            <Segmented<SignatureMode>
              value={signatureMode}
              onChange={setSignatureMode}
              options={[
                { value: "digital", label: "Digital" },
                { value: "wet", label: "Sign by hand" },
              ]}
            />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Digital: the company signature, added once approved. By hand: the space is left empty to sign on paper.
            </Typography.Text>
            <Typography.Text strong style={{ marginTop: 4 }}>
              Materai
            </Typography.Text>
            <Segmented<Materai>
              value={materai}
              onChange={setMaterai}
              options={[
                { value: "none", label: "None" },
                { value: "physical", label: "Physical materai" },
                { value: "e_meterai", label: "e-Meterai" },
              ]}
            />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Physical: a box to stick a Rp10.000 materai on and sign across. e-Meterai: an empty space where the stamp goes — stamp the PDF on your e-Meterai provider's site. Both can be changed later on the invoice.
            </Typography.Text>
            {needsMateraiHint({ currency: quotation.currency, total: quotation.total }, materai) ? (
              <Alert type="info" showIcon title="Over Rp5.000.000" description="Documents in IDR above Rp5.000.000 usually carry a Rp10.000 materai." />
            ) : null}
          </Flex>
        </Card>

        {error ? <Alert type="error" showIcon title={error} /> : null}
        <Flex vertical gap={6}>
          <div>
            <Button type="primary" size="large" icon={isApprover && toSign ? <DownloadOutlined /> : <TransactionOutlined />} loading={pending} disabled={Boolean(quotation.customer_id && !linked)} onClick={convert}>
              {isApprover ? (toSign ? "Create & download to sign" : "Create & send invoice") : "Create & request approval"}
            </Button>
          </div>
          {isApprover ? null : (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              It is created now and goes to the customer once an approver approves it.
            </Typography.Text>
          )}
        </Flex>
      </Flex>
    </>
  );
}
