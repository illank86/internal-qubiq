import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Empty, Flex, Segmented, Skeleton, Typography, theme } from "antd";
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  DownOutlined,
  EditOutlined,
  FileAddOutlined,
  FileDoneOutlined,
  MailOutlined,
  SafetyCertificateOutlined,
  SendOutlined,
  StopOutlined,
  UpOutlined,
  UploadOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { loadHistory, type DocumentType, type HistoryEvent } from "./api";

/**
 * Everything that happened to a quotation or invoice, newest first and by
 * day: who made it, every change (and what it changed to), approvals and
 * rejections, signed copies, and every email sent.
 */

// Columns the approval and email entries already explain, or that are noise.
const QUIET = new Set([
  "approval_status", "approval_requested_by", "approval_requested_at", "approved_by", "approved_at", "approval_note", "approval_sends",
  "signature_id", "send_count", "sent_at", "customer_revision", "updated_at", "created_at", "signed_copy_path", "signed_copy_uploaded_by",
  "signed_copy_uploaded_at", "signed_copy_check", "signed_copy_confirmed_by", "signed_copy_confirmed_at", "signed_copy_sent_at", "emeterai_serial",
  "public_token", "claim_token", "id", "number", "seller", "po_file_name",
]);
const PRICED = new Set(["subtotal", "tax_amount", "total"]);
const STATUS_LABEL: Record<string, string> = {
  draft: "Back to draft",
  sent: "Marked sent",
  accepted: "Marked accepted",
  declined: "Marked declined",
  cancelled: "Cancelled",
  paid: "Marked paid",
  unpaid: "Marked not paid",
  void: "Voided",
};
const FIELD: Record<string, string> = {
  bill_to_name: "Invoiced to",
  bill_to_email: "Billing email",
  bill_to_company: "Company",
  bill_to_address: "Billing address",
  contact_name: "Contact",
  contact_email: "Email",
  cc_emails: "CC",
  due_date: "Due date",
  valid_until: "Valid until",
  tax_rate: "Tax rate",
  signature_mode: "Signature",
  materai: "Materai",
  customer_id: "Customer account",
  owner_id: "Customer account",
  claimed_at: "Added to an account",
  po_number: "PO reference",
  po_path: "Purchase order file",
  licensee_name: "Licensed to",
  licensee_address: "Licensee address",
};
const label = (key: string) => FIELD[key] ?? key.replace(/_/g, " ").replace(/^./, (first) => first.toUpperCase());

const show = (value: unknown) => {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  if (typeof value === "object") return JSON.stringify(value);
  const text = String(value);
  return text.length > 160 ? `${text.slice(0, 160)}…` : text;
};

type Kind = "change" | "approval" | "email";
type Tone = "neutral" | "info" | "success" | "warning" | "danger";
type Entry = {
  key: string;
  at: string;
  kind: Kind;
  tone: Tone;
  icon: React.ReactNode;
  title: string;
  actor: string | null;
  detail?: React.ReactNode;
  changes?: [string, unknown][];
};

function describe(event: HistoryEvent, index: number): Entry | null {
  const base = { key: `${event.source}-${event.at}-${index}`, at: event.at, actor: event.actor };
  if (event.source === "created") return { ...base, kind: "change", tone: "neutral", icon: <FileAddOutlined />, title: "Created" };

  if (event.source === "approval") {
    const map: Record<string, Pick<Entry, "tone" | "icon" | "title" | "detail">> = {
      requested: { tone: "warning", icon: <SendOutlined />, title: "Asked for approval" },
      approved: { tone: "success", icon: <CheckCircleOutlined />, title: "Approved" },
      self_approved: { tone: "success", icon: <CheckCircleOutlined />, title: "Approved and sent" },
      rejected: { tone: "danger", icon: <CloseCircleOutlined />, title: "Not approved", detail: event.note ? `“${event.note}”` : undefined },
      signed_uploaded: { tone: "info", icon: <UploadOutlined />, title: "Signed copy uploaded", detail: event.note ?? undefined },
      signed_confirmed: { tone: "info", icon: <SafetyCertificateOutlined />, title: "Scan checked and confirmed" },
      signed_sent: { tone: "success", icon: <FileDoneOutlined />, title: "Signed copy sent" },
    };
    const entry = map[event.action];
    return entry ? { ...base, kind: "approval", ...entry } : null;
  }

  if (event.source === "email") {
    const failed = Boolean(event.status && event.status !== "sent");
    return {
      ...base,
      kind: "email",
      tone: failed ? "danger" : "info",
      icon: failed ? <WarningOutlined /> : <MailOutlined />,
      title: failed ? "Email not delivered" : "Email sent",
      actor: null,
      detail: (
        <Flex vertical gap={2}>
          {event.summary ? <Typography.Text style={{ fontSize: 13 }}>{event.summary}</Typography.Text> : null}
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            To {event.recipient ?? "—"}
            {event.cc?.length ? ` · CC ${event.cc.join(", ")}` : ""}
          </Typography.Text>
          {failed && event.note ? (
            <Typography.Text type="danger" style={{ fontSize: 12 }}>
              {event.note}
            </Typography.Text>
          ) : null}
        </Flex>
      ),
    };
  }

  // A change to the record.
  if (event.action === "create") return null;
  if (event.action === "delete") return { ...base, kind: "change", tone: "danger", icon: <StopOutlined />, title: "Deleted" };
  const changes = Object.entries(event.changes ?? {}).filter(([field]) => !QUIET.has(field));
  if (changes.length === 0) return null;
  const status = changes.find(([field]) => field === "status");
  const priced = changes.some(([field]) => PRICED.has(field));
  const fields = changes.filter(([field]) => field !== "status" && !PRICED.has(field)).map(([field]) => label(field));
  const title = status
    ? (STATUS_LABEL[String(status[1])] ?? `Status: ${String(status[1])}`)
    : priced && fields.length === 0
      ? "Lines or prices changed"
      : "Edited";
  const summary = [priced && (status || fields.length) ? "Lines or prices" : null, ...fields].filter(Boolean).join(", ");
  const tone: Tone = status ? (["cancelled", "void", "declined"].includes(String(status[1])) ? "danger" : "success") : "neutral";
  return {
    ...base,
    kind: "change",
    tone,
    icon: status ? <CheckCircleOutlined /> : <EditOutlined />,
    title,
    detail: summary ? (
      <Typography.Text type="secondary" style={{ fontSize: 13 }}>
        {summary}
      </Typography.Text>
    ) : undefined,
    changes,
  };
}

const dayLabel = (iso: string) => {
  const date = new Date(iso);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(date, new Date())) return "Today";
  if (same(date, new Date(Date.now() - 86_400_000))) return "Yesterday";
  return date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
};
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

function Changes({ changes }: { changes: [string, unknown][] }) {
  const { token } = theme.useToken();
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 4 }}>
      <Button type="link" size="small" style={{ padding: 0, height: "auto", fontSize: 12 }} onClick={() => setOpen(!open)}>
        {open ? <UpOutlined /> : <DownOutlined />} {open ? "Hide what changed" : "Show what changed"}
      </Button>
      {open ? (
        <div
          style={{
            marginTop: 6,
            display: "grid",
            gridTemplateColumns: "minmax(90px, max-content) minmax(0, 1fr)",
            columnGap: 12,
            rowGap: 4,
            padding: "8px 10px",
            borderRadius: token.borderRadius,
            background: token.colorFillQuaternary,
          }}
        >
          {changes.flatMap(([field, value]) => [
            <Typography.Text key={`${field}-label`} type="secondary" style={{ fontSize: 12 }}>
              {label(field)}
            </Typography.Text>,
            <Typography.Text key={`${field}-value`} style={{ fontSize: 12, wordBreak: "break-word" }}>
              {show(value)}
            </Typography.Text>,
          ])}
        </div>
      ) : null}
    </div>
  );
}

type Filter = "all" | Kind;

export function DocumentHistory({ type, id }: { type: DocumentType; id: string }) {
  const { token } = theme.useToken();
  const [filter, setFilter] = useState<Filter>("all");
  const { data, isLoading } = useQuery({ queryKey: ["history", type, id], queryFn: () => loadHistory(type, id) });
  if (isLoading) return <Skeleton active avatar paragraph={{ rows: 3 }} />;

  const entries = (data ?? []).map(describe).filter((entry): entry is Entry => entry !== null);
  if (entries.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing recorded yet." />;
  const count = (kind: Kind) => entries.filter((entry) => entry.kind === kind).length;
  const shown = filter === "all" ? entries : entries.filter((entry) => entry.kind === filter);

  const tones: Record<Tone, { color: string; background: string }> = {
    neutral: { color: token.colorTextSecondary, background: token.colorFillSecondary },
    info: { color: token.colorInfo, background: token.colorInfoBg },
    success: { color: token.colorSuccess, background: token.colorSuccessBg },
    warning: { color: token.colorWarning, background: token.colorWarningBg },
    danger: { color: token.colorError, background: token.colorErrorBg },
  };

  // By day, newest first (as the list already is).
  const days: { day: string; entries: Entry[] }[] = [];
  for (const entry of shown) {
    const day = dayLabel(entry.at);
    const current = days.at(-1);
    if (current?.day === day) current.entries.push(entry);
    else days.push({ day, entries: [entry] });
  }

  return (
    <Flex vertical gap={16}>
      <Segmented<Filter>
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: `All ${entries.length}` },
          { value: "change", label: `Changes ${count("change")}` },
          { value: "approval", label: `Approvals ${count("approval")}` },
          { value: "email", label: `Emails ${count("email")}` },
        ]}
      />
      {shown.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing of this kind yet." /> : null}
      {days.map(({ day, entries: list }) => (
        <div key={day}>
          <Typography.Text type="secondary" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>
            {day}
          </Typography.Text>
          <div style={{ marginTop: 8 }}>
            {list.map((entry, index) => {
              const tone = tones[entry.tone];
              const last = index === list.length - 1;
              return (
                <div key={entry.key} style={{ display: "grid", gridTemplateColumns: "32px minmax(0, 1fr)", columnGap: 12 }}>
                  {/* The icon, and the line down to the next entry of the day. */}
                  <Flex vertical align="center">
                    <Flex
                      align="center"
                      justify="center"
                      style={{ width: 32, height: 32, borderRadius: "50%", background: tone.background, color: tone.color, fontSize: 15, flexShrink: 0 }}
                    >
                      {entry.icon}
                    </Flex>
                    {last ? null : <div style={{ width: 2, flex: 1, minHeight: 12, background: token.colorBorderSecondary, margin: "4px 0" }} />}
                  </Flex>
                  <div style={{ paddingBottom: last ? 0 : 16, minWidth: 0 }}>
                    <Flex justify="space-between" align="center" gap={8} style={{ minHeight: 32 }}>
                      <Typography.Text strong>{entry.title}</Typography.Text>
                      <Typography.Text type="secondary" style={{ fontSize: 12, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                        {timeLabel(entry.at)}
                      </Typography.Text>
                    </Flex>
                    {entry.actor ? (
                      <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: -4 }}>
                        by {entry.actor}
                      </Typography.Text>
                    ) : null}
                    {entry.detail ? <div style={{ marginTop: 2 }}>{entry.detail}</div> : null}
                    {entry.changes?.length ? <Changes changes={entry.changes} /> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </Flex>
  );
}
