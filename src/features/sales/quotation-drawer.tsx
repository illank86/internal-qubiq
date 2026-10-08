import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Button, Card, Col, Descriptions, Drawer, Flex, Row, Typography } from "antd";
import { EditOutlined, FilePdfOutlined, TransactionOutlined, UserOutlined } from "@ant-design/icons";
import { formatInvoiceDate, formatMoney } from "@/lib/invoices";
import { isExpired, type Quotation } from "@/lib/quotations";
import { supabase } from "@/lib/supabase";
import { usePdfViewer } from "@/components/pdf-viewer-context";
import { needsSigning, quotationPdf, signingHint } from "./api";
import { ApprovalNote } from "./approvals";
import { DocumentHistory } from "./document-history";
import { QuotationStatusTag } from "./quotation-parts";
import { SigningActions, SigningTag } from "./signing";
import type { useAction } from "./use-action";

export type QuotationRow = Quotation & {
  request: { reference: string } | null;
  invoices: { id: string; number: string | null; status: string }[];
  customer: { full_name: string | null; email: string | null } | null;
  approver: { full_name: string | null } | null;
  requester: { full_name: string | null } | null;
};

const SOURCE_LABEL: Record<string, string> = { website: "Website request", phone: "By phone", email: "By email", meeting: "From a meeting", other: "Made by hand" };

/**
 * One quotation at a glance: who it is for and who is copied, where it stands
 * (approval and the signed copy), what is quoted, and its full history. Lines
 * and prices are changed in the builder.
 */
export function QuotationDrawer({
  quotation,
  onClose,
  isApprover,
  run,
  busy,
}: {
  quotation: QuotationRow | null;
  onClose: () => void;
  isApprover: boolean;
  run: ReturnType<typeof useAction>["run"];
  busy: string | null;
}) {
  const navigate = useNavigate();
  const viewPdf = usePdfViewer();
  const { data: groups } = useQuery({
    queryKey: ["quotation-groups", quotation?.id],
    enabled: Boolean(quotation),
    queryFn: async () => (await supabase.from("quotation_groups").select("label, quantity, subtotal").eq("quotation_id", quotation!.id).order("position")).data ?? [],
  });

  if (!quotation) return <Drawer open={false} onClose={onClose} />;
  const money = (amount: number) => formatMoney(amount, quotation.currency, quotation.decimal_places);
  const editable = quotation.status === "draft" || quotation.status === "sent";
  const invoice = quotation.invoices.find((candidate) => candidate.status !== "void");

  return (
    <Drawer
      open
      onClose={onClose}
      size={820}
      destroyOnHidden
      title={
        <Flex gap={8} align="center" wrap>
          <span style={{ fontFamily: "Geist Mono, monospace" }}>{quotation.number ?? "Quotation"}</span>
          <QuotationStatusTag quotation={quotation} />
          <SigningTag row={quotation} />
        </Flex>
      }
      extra={
        <Flex gap={8}>
          <Button icon={<FilePdfOutlined />} onClick={() => viewPdf(quotationPdf(quotation.id, quotation.number))}>
            View PDF
          </Button>
          {editable ? (
            <Button type="primary" icon={<EditOutlined />} onClick={() => navigate(`/sales/quotations/${quotation.id}/edit`)}>
              {isExpired(quotation) ? "Renew" : "Edit lines & prices"}
            </Button>
          ) : null}
        </Flex>
      }
    >
      <Row gutter={[24, 16]}>
        <Col xs={24} lg={14}>
          <Flex vertical gap={16}>
            <Descriptions
              column={1}
              size="small"
              bordered
              title="Prepared for"
              items={[
                { key: "company", label: "Company", children: quotation.company || "—" },
                {
                  key: "contact",
                  label: "Contact",
                  children: (
                    <>
                      {quotation.contact_name}
                      {quotation.job_title ? <Typography.Text type="secondary"> · {quotation.job_title}</Typography.Text> : null}
                    </>
                  ),
                },
                { key: "email", label: "Email", children: quotation.contact_email || "—" },
                {
                  key: "licensee",
                  label: "Licensed to",
                  children: quotation.licensee_name ? (
                    <>
                      <Typography.Text strong>{quotation.licensee_name}</Typography.Text>
                      {quotation.licensee_address ? <div style={{ whiteSpace: "pre-line" }}>{quotation.licensee_address}</div> : null}
                    </>
                  ) : (
                    <Typography.Text type="secondary">The customer ({quotation.company || quotation.contact_name})</Typography.Text>
                  ),
                },
                { key: "cc", label: "CC", children: quotation.cc_emails?.length ? quotation.cc_emails.join(", ") : "—" },
                { key: "phone", label: "Phone", children: quotation.phone || "—" },
                {
                  key: "address",
                  label: "Address",
                  children: <span style={{ whiteSpace: "pre-line" }}>{[quotation.address, quotation.country].filter(Boolean).join("\n") || "—"}</span>,
                },
                {
                  key: "account",
                  label: "Customer account",
                  children: quotation.customer ? (
                    <Button type="link" size="small" style={{ padding: 0 }} icon={<UserOutlined />} onClick={() => navigate(`/sales/quotations/${quotation.id}/customer`)}>
                      {quotation.customer.full_name || quotation.customer.email}
                    </Button>
                  ) : quotation.status !== "draft" ? (
                    <Button type="link" size="small" style={{ padding: 0 }} onClick={() => navigate(`/sales/quotations/${quotation.id}/customer`)}>
                      None yet — link one
                    </Button>
                  ) : (
                    "—"
                  ),
                },
              ]}
            />
            <Descriptions
              column={1}
              size="small"
              bordered
              title="Quotation"
              items={[
                { key: "valid", label: "Valid until", children: formatInvoiceDate(quotation.valid_until) },
                { key: "sales", label: "Our contact", children: [quotation.sales_name, quotation.sales_email].filter(Boolean).join(" · ") || "—" },
                { key: "source", label: "Source", children: quotation.request ? `From ${quotation.request.reference}` : (SOURCE_LABEL[quotation.source] ?? quotation.source) },
                { key: "signature", label: "Signature", children: quotation.signature_mode === "wet" ? "Signed by hand" : "Digital" },
                ...(quotation.sent_at ? [{ key: "sent", label: "First sent", children: formatInvoiceDate(quotation.sent_at) }] : []),
                ...(quotation.internal_note ? [{ key: "note", label: "Internal note", children: <span style={{ whiteSpace: "pre-line" }}>{quotation.internal_note}</span> }] : []),
                ...(invoice
                  ? [
                      {
                        key: "invoice",
                        label: "Invoice",
                        children: (
                          <Button type="link" size="small" style={{ padding: 0 }} icon={<TransactionOutlined />} onClick={() => navigate(`/sales/invoices?invoice=${invoice.id}`)}>
                            {invoice.number}
                          </Button>
                        ),
                      },
                    ]
                  : []),
              ]}
            />
          </Flex>
        </Col>
        <Col xs={24} lg={10}>
          <Flex vertical gap={16}>
            <Card size="small" title="Where it stands">
              <Flex vertical gap={8} align="flex-start">
                <ApprovalNote
                  state={quotation.approval_status}
                  note={quotation.approval_note}
                  requestedBy={quotation.requester?.full_name}
                  approvedBy={quotation.approved_by ? quotation.approver?.full_name : null}
                  approvedAt={quotation.approved_at}
                  edited={quotation.status === "sent" && quotation.approval_status === "none"}
                />
                {quotation.status === "draft" && quotation.approval_status === "none" ? <Typography.Text type="secondary">Not sent yet.</Typography.Text> : null}
                {needsSigning(quotation) ? (
                  <>
                    <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                      {signingHint(quotation)}
                    </Typography.Text>
                    <SigningActions type="quotation" row={quotation} isApprover={isApprover} run={run} busy={busy} size="middle" showView />
                  </>
                ) : null}
              </Flex>
            </Card>
            <Card size="small" title="What is quoted">
              <Flex vertical gap={6}>
                {(groups ?? []).map((group, index) => (
                  <Flex key={index} justify="space-between" gap={12}>
                    <Typography.Text type="secondary">
                      {group.label} × {group.quantity}
                    </Typography.Text>
                    <span>{money(Number(group.subtotal))}</span>
                  </Flex>
                ))}
                <Flex justify="space-between">
                  <Typography.Text type="secondary">Subtotal</Typography.Text>
                  <span>{money(Number(quotation.subtotal))}</span>
                </Flex>
                <Flex justify="space-between">
                  <Typography.Text type="secondary">
                    {quotation.tax_label} ({Number(quotation.tax_rate)}%)
                  </Typography.Text>
                  <span>{money(Number(quotation.tax_amount))}</span>
                </Flex>
                <Flex justify="space-between">
                  <Typography.Text strong>Total</Typography.Text>
                  <Typography.Text strong>{money(Number(quotation.total))}</Typography.Text>
                </Flex>
              </Flex>
            </Card>
            <Card size="small" title="History">
              <DocumentHistory type="quotation" id={quotation.id} />
            </Card>
          </Flex>
        </Col>
      </Row>
    </Drawer>
  );
}
