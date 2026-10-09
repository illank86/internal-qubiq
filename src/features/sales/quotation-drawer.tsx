import { useState } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Button, Divider, Drawer, Flex, Tabs, Typography } from "antd";
import { EditOutlined, FilePdfOutlined, TransactionOutlined, UserOutlined } from "@ant-design/icons";
import { formatInvoiceDate, formatMoney } from "@/lib/invoices";
import { isExpired, type Quotation } from "@/lib/quotations";
import { supabase } from "@/lib/supabase";
import { usePdfViewer } from "@/components/pdf-viewer-context";
import { needsSigning, quotationPdf, signingHint } from "./api";
import { ApprovalNote } from "./approvals";
import { DocumentHistory } from "./document-history";
import { DocumentLines } from "./document-lines";
import { InfoSection, StandingPanel, StatRow, Totals } from "./drawer-parts";
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
  const [tab, setTab] = useState("overview");
  const { data: lines } = useQuery({
    queryKey: ["quotation-lines", quotation?.id],
    enabled: Boolean(quotation),
    queryFn: async () => {
      const [{ data: groups }, { data: items }] = await Promise.all([
        supabase.from("quotation_groups").select("id, label, quantity, subtotal").eq("quotation_id", quotation!.id).order("position"),
        supabase.from("quotation_items").select("id, group_id, description, detail, amount, edition_id").eq("quotation_id", quotation!.id).order("position"),
      ]);
      return { groups: groups ?? [], items: items ?? [] };
    },
  });

  if (!quotation) return <Drawer open={false} onClose={onClose} />;
  const money = (amount: number) => formatMoney(amount, quotation.currency, quotation.decimal_places);
  const editable = quotation.status === "draft" || quotation.status === "sent";
  const invoice = quotation.invoices.find((candidate) => candidate.status !== "void");
  const servers = (lines?.groups ?? []).reduce((sum, group) => sum + group.quantity, 0);
  const account = () => navigate(`/sales/quotations/${quotation.id}/customer`);
  const link = { padding: 0, height: "auto" } as const;

  const overview = (
    <Flex vertical gap={28}>
      <InfoSection
        title="Prepared for"
        items={[
          {
            label: "Contact",
            value: (
              <>
                <Typography.Text strong>{quotation.contact_name}</Typography.Text>
                {quotation.job_title ? <Typography.Text type="secondary"> · {quotation.job_title}</Typography.Text> : null}
              </>
            ),
          },
          { label: "Company", value: quotation.company || "—" },
          { label: "Email", value: quotation.contact_email || "—" },
          { label: "Phone", value: quotation.phone || "—" },
          { label: "CC", value: quotation.cc_emails?.length ? quotation.cc_emails.join(", ") : "—" },
          {
            label: "Customer account",
            value: quotation.customer ? (
              <Button type="link" size="small" style={link} icon={<UserOutlined />} onClick={account}>
                {quotation.customer.full_name || quotation.customer.email}
              </Button>
            ) : quotation.status !== "draft" ? (
              <Button type="link" size="small" style={link} onClick={account}>
                None yet — link one
              </Button>
            ) : (
              "—"
            ),
          },
          { label: "Address", value: <span style={{ whiteSpace: "pre-line" }}>{[quotation.address, quotation.country].filter(Boolean).join("\n") || "—"}</span> },
          {
            label: "Licensed to",
            value: quotation.licensee_name ? (
              <>
                <Typography.Text strong>{quotation.licensee_name}</Typography.Text>
                {quotation.licensee_address ? <div style={{ whiteSpace: "pre-line" }}>{quotation.licensee_address}</div> : null}
              </>
            ) : (
              <Typography.Text type="secondary">The customer</Typography.Text>
            ),
          },
        ]}
      />
      <Divider style={{ margin: 0 }} />
      <InfoSection
        title="Quotation"
        items={[
          { label: "Our contact", value: [quotation.sales_name, quotation.sales_email].filter(Boolean).join(" · ") || "—" },
          { label: "Source", value: quotation.request ? `From ${quotation.request.reference}` : (SOURCE_LABEL[quotation.source] ?? quotation.source) },
          { label: "Signature", value: quotation.signature_mode === "wet" ? "Signed by hand" : "Digital" },
          { label: "First sent", value: quotation.sent_at ? formatInvoiceDate(quotation.sent_at) : "Not yet" },
          ...(invoice
            ? [
                {
                  label: "Invoice",
                  value: (
                    <Button type="link" size="small" style={link} icon={<TransactionOutlined />} onClick={() => navigate(`/sales/invoices?invoice=${invoice.id}`)}>
                      {invoice.number}
                    </Button>
                  ),
                },
              ]
            : []),
          ...(quotation.internal_note
            ? [{ label: "Internal note", wide: true, value: <span style={{ whiteSpace: "pre-line" }}>{quotation.internal_note}</span> }]
            : []),
        ]}
      />
    </Flex>
  );

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
      <Flex vertical gap={16}>
        <Typography.Text type="secondary">
          For <Typography.Text strong>{quotation.company || quotation.contact_name}</Typography.Text>
        </Typography.Text>
        <StatRow
          stats={[
            { label: "Total", value: money(Number(quotation.total)), strong: true },
            { label: "Valid until", value: formatInvoiceDate(quotation.valid_until) },
            { label: "Servers", value: lines ? servers : "—" },
            { label: "Currency", value: quotation.currency },
          ]}
        />
        <StandingPanel>
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
        </StandingPanel>
        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={[
            { key: "overview", label: "Overview", children: overview },
            {
              key: "lines",
              label: `Modules${lines ? ` (${lines.items.length})` : ""}`,
              children: (
                <Flex vertical gap={16}>
                  <DocumentLines groups={lines?.groups ?? []} items={lines?.items ?? []} money={money} />
                  <Totals
                    rows={[
                      { label: "Subtotal", value: money(Number(quotation.subtotal)) },
                      { label: `${quotation.tax_label} (${Number(quotation.tax_rate)}%)`, value: money(Number(quotation.tax_amount)) },
                    ]}
                    total={{ label: "Total", value: money(Number(quotation.total)) }}
                  />
                </Flex>
              ),
            },
            { key: "history", label: "History", children: <DocumentHistory type="quotation" id={quotation.id} /> },
          ]}
        />
      </Flex>
    </Drawer>
  );
}
