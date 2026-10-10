import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { Alert, Button, Card, Descriptions, Flex, Input, Modal, Result, Skeleton, Tag, Typography, theme } from "antd";
import { CheckOutlined, CloseOutlined, ExportOutlined, LockOutlined } from "@ant-design/icons";
import { Logo } from "@/components/ui";
import { env } from "@/lib/env";
import { formatInvoiceDate, formatMoney } from "@/lib/invoices";
import { renderInvoicePdf } from "@/lib/invoice-pdf";
import { renderQuotationPdf } from "@/lib/quotation-pdf";

/**
 * /approve/:token — approve or reject a quotation or invoice from the
 * approval email, without signing in. The link only shows the document;
 * the decision needs the approver's 6-digit approval PIN. Everything is
 * checked by the approval-link edge function and the database.
 */

type View =
  | { state: "invalid" | "used" | "expired" }
  | { state: "decided" | "changed"; message: string }
  | {
      state: "open";
      type: "quotation" | "invoice";
      expires_at: string;
      approver: string | null;
      requester: string | null;
      has_pin: boolean;
      locked_until: string | null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      document: any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      items: any[];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      groups: any[];
    };
type Decision = { ok: boolean; error?: string; message?: string; decision?: "approve" | "reject"; state?: string };

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${env.supabaseUrl}/functions/v1/approval-link`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: env.supabaseKey },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok && !("ok" in data) && !("state" in data)) throw new Error(data.error ?? "That did not work. Please try again.");
  return data as T;
}

function Page({ children }: { children: React.ReactNode }) {
  const { token } = theme.useToken();
  return (
    <div style={{ minHeight: "100dvh", background: token.colorBgLayout, padding: "24px 16px 48px" }}>
      <Flex vertical gap={20} style={{ maxWidth: 980, margin: "0 auto" }}>
        <Typography.Text style={{ lineHeight: 0 }}>
          <Logo height={24} />
        </Typography.Text>
        {children}
      </Flex>
    </div>
  );
}

const CLOSED: Record<string, { status: "info" | "warning"; title: string }> = {
  invalid: { status: "warning", title: "This approval link is not valid" },
  used: { status: "info", title: "This link was already used" },
  expired: { status: "warning", title: "This approval link has expired" },
  decided: { status: "info", title: "Already decided" },
  changed: { status: "warning", title: "It changed after this email was sent" },
};

export function ApprovePage() {
  const { token = "" } = useParams();
  const [view, setView] = useState<View | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [asking, setAsking] = useState<"approve" | "reject" | null>(null);
  const [pin, setPin] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Decision | null>(null);

  useEffect(() => {
    let cancelled = false;
    call<View>({ action: "view", token })
      .then((result) => !cancelled && setView(result))
      .catch((cause: Error) => !cancelled && setLoadError(cause.message));
    return () => {
      cancelled = true;
    };
  }, [token]);

  // The PDF, drawn here from what the link returned (no signature: it is not approved yet).
  useEffect(() => {
    if (view?.state !== "open") return;
    let url: string | null = null;
    const doc = { ...view.document, public_token: "00000000-0000-0000-0000-000000000000" };
    (view.type === "invoice" ? renderInvoicePdf(doc, view.items, view.groups, null) : renderQuotationPdf(doc, view.items, view.groups, null))
      .then((blob) => {
        url = URL.createObjectURL(blob);
        setPdfUrl(url);
      })
      .catch(() => setPdfUrl(null));
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [view]);

  const facts = useMemo(() => {
    if (view?.state !== "open") return null;
    const doc = view.document;
    const isQuote = view.type === "quotation";
    return {
      title: `${isQuote ? "Quotation" : "Invoice"} ${doc.number ?? ""}`.trim(),
      customer: isQuote ? doc.company || doc.contact_name : doc.bill_to_name,
      total: formatMoney(doc.total, doc.currency, doc.decimal_places),
      date: isQuote ? `Valid until ${formatInvoiceDate(doc.valid_until)}` : `Due ${formatInvoiceDate(doc.due_date)}`,
      po: !isQuote ? doc.po_number : null,
    };
  }, [view]);

  const decide = async () => {
    if (!asking) return;
    if (!/^\d{6}$/.test(pin)) return setError("Enter your 6-digit approval PIN.");
    if (asking === "reject" && !reason.trim()) return setError("Say why, so it can be put right.");
    setPending(true);
    setError(null);
    try {
      const result = await call<Decision>({ action: "decide", token, pin, decision: asking, reason: asking === "reject" ? reason.trim() : undefined });
      if (result.ok) {
        setDone(result);
        setAsking(null);
      } else if (result.state && result.state !== "open") {
        setAsking(null);
        setView({ state: result.state as "decided", message: result.error ?? "" });
      } else {
        setError(result.error ?? "That did not work. Please try again.");
        setPin("");
      }
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setPending(false);
    }
  };

  const adminLink = `${window.location.origin}/sales/${view?.state === "open" && view.type === "quotation" ? "quotations" : "invoices"}`;

  if (loadError) return <Page><Result status="error" title="The link could not be checked" subTitle={loadError} /></Page>;
  if (!view) return <Page><Card><Skeleton active paragraph={{ rows: 8 }} /></Card></Page>;

  if (done) {
    return (
      <Page>
        <Card>
          <Result
            status={done.decision === "approve" ? "success" : "info"}
            title={done.decision === "approve" ? `${facts?.title ?? "It"} is approved` : `${facts?.title ?? "It"} was not approved`}
            subTitle={
              done.decision === "approve"
                ? "Thank you. It goes to the customer now (or once its signed copy is uploaded), and the other approvers have been told."
                : "The person who asked has been told why. Nothing was sent to the customer."
            }
          />
        </Card>
      </Page>
    );
  }

  if (view.state !== "open") {
    const closed = CLOSED[view.state];
    const message = "message" in view ? view.message : view.state === "expired" ? "Approval links work for 72 hours. Open it in QUBIQ Admin to decide." : view.state === "used" ? "Each approval link works once." : "Open the newest approval email, or QUBIQ Admin.";
    return (
      <Page>
        <Card>
          <Result
            status={closed.status}
            title={closed.title}
            subTitle={message}
            extra={
              <Button href={`${window.location.origin}/`} icon={<ExportOutlined />}>
                Open QUBIQ Admin
              </Button>
            }
          />
        </Card>
      </Page>
    );
  }

  // Sent only while the PIN is locked.
  const locked = Boolean(view.locked_until);
  return (
    <Page>
      <Card>
        <Flex justify="space-between" align="flex-start" gap={16} wrap>
          <div>
            <Flex align="center" gap={8} wrap>
              <Typography.Title level={3} style={{ margin: 0 }}>
                {facts?.title}
              </Typography.Title>
              <Tag color="gold">Waiting for your approval</Tag>
            </Flex>
            <Typography.Text type="secondary">
              For <Typography.Text strong>{facts?.customer}</Typography.Text> · asked by {view.requester ?? "a colleague"}
            </Typography.Text>
          </div>
          <Flex vertical align="flex-end">
            <Typography.Text type="secondary" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>
              Total
            </Typography.Text>
            <Typography.Text strong style={{ fontSize: 24, color: "var(--ant-color-primary)", fontVariantNumeric: "tabular-nums" }}>
              {facts?.total}
            </Typography.Text>
          </Flex>
        </Flex>
        <Descriptions
          size="small"
          column={{ xs: 1, sm: 3 }}
          style={{ marginTop: 16 }}
          items={[
            { key: "date", label: "Dates", children: facts?.date },
            ...(facts?.po ? [{ key: "po", label: "PO ref.", children: facts.po }] : []),
            { key: "approver", label: "Approving as", children: view.approver ?? "—" },
            { key: "expires", label: "Link expires", children: new Date(view.expires_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) },
          ]}
        />
        {!view.has_pin ? (
          <Alert
            type="warning"
            showIcon
            style={{ marginTop: 12 }}
            title="Set your approval PIN first"
            description={
              <>
                Approving from email needs a 6-digit approval PIN. Set it once in QUBIQ Admin under{" "}
                <Typography.Link href={`${window.location.origin}/account`} target="_blank">
                  My profile → Approval PIN
                </Typography.Link>
                , then come back to this link.
              </>
            }
          />
        ) : null}
        {locked ? <Alert type="error" showIcon style={{ marginTop: 12 }} title="Too many wrong PINs" description="Try again in a few minutes." /> : null}
        <Flex gap={8} wrap style={{ marginTop: 16 }}>
          <Button type="primary" size="large" icon={<CheckOutlined />} disabled={!view.has_pin || Boolean(locked)} onClick={() => { setAsking("approve"); setPin(""); setError(null); }}>
            Approve
          </Button>
          <Button danger size="large" icon={<CloseOutlined />} disabled={!view.has_pin || Boolean(locked)} onClick={() => { setAsking("reject"); setPin(""); setReason(""); setError(null); }}>
            Reject…
          </Button>
          <Button size="large" icon={<ExportOutlined />} href={pdfUrl ?? undefined} target="_blank" disabled={!pdfUrl}>
            Open PDF
          </Button>
          <Button size="large" type="link" href={adminLink} target="_blank">
            Open in QUBIQ Admin
          </Button>
        </Flex>
      </Card>

      <Card styles={{ body: { padding: 0 } }}>
        {pdfUrl ? (
          <iframe title="Document" src={pdfUrl} style={{ width: "100%", height: "80vh", border: 0, display: "block", borderRadius: 8 }} />
        ) : (
          <div style={{ padding: 24 }}>
            <Skeleton active paragraph={{ rows: 10 }} />
          </div>
        )}
      </Card>

      <Modal
        open={asking !== null}
        title={asking === "approve" ? `Approve ${facts?.title ?? ""}` : `Reject ${facts?.title ?? ""}`}
        okText={asking === "approve" ? "Approve" : "Reject"}
        okButtonProps={{ danger: asking === "reject", loading: pending, disabled: pin.length !== 6 || (asking === "reject" && !reason.trim()) }}
        onOk={decide}
        onCancel={() => setAsking(null)}
        destroyOnHidden
      >
        <Flex vertical gap={14}>
          {asking === "approve" ? (
            <Typography.Text type="secondary">
              It is sent to the customer as soon as you approve, unless it must be signed by hand or stamped first.
            </Typography.Text>
          ) : (
            <Input.TextArea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} maxLength={1000} placeholder="Why — so it can be put right" autoFocus />
          )}
          <div>
            <Typography.Text strong>
              <LockOutlined /> Your approval PIN
            </Typography.Text>
            <div style={{ marginTop: 8 }}>
              <Input.OTP length={6} mask="•" value={pin} onChange={setPin} autoFocus={asking === "approve"} formatter={(value) => value.replace(/\D/g, "")} />
            </div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Not your password — the 6 digits you set in QUBIQ Admin.
            </Typography.Text>
          </div>
          {error ? <Alert type="error" showIcon title={error} /> : null}
        </Flex>
      </Modal>
    </Page>
  );
}
