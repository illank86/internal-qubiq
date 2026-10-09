import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Empty, Flex, Spin, Tag, Timeline, Typography } from "antd";
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  EditOutlined,
  FileAddOutlined,
  FileDoneOutlined,
  MailOutlined,
  SafetyCertificateOutlined,
  SendOutlined,
  StopOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { loadHistory, type DocumentType, type HistoryEvent } from "./api";

/**
 * Everything that happened to a quotation or invoice, newest first: who made
 * it, every change (and what it changed to), approvals and rejections, signed
 * copies, and every email sent.
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

const when = (value: string) =>
  new Date(value).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

const show = (value: unknown) => {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  if (typeof value === "object") return JSON.stringify(value);
  const text = String(value);
  return text.length > 160 ? `${text.slice(0, 160)}…` : text;
};

type Entry = { key: string; at: string; color: string; icon: React.ReactNode; title: React.ReactNode; detail?: React.ReactNode; changes?: [string, unknown][] };

function describe(event: HistoryEvent, index: number): Entry | null {
  const by = event.actor ? ` · ${event.actor}` : "";
  const key = `${event.source}-${event.at}-${index}`;
  const at = event.at;
  if (event.source === "created") return { key, at, color: "gray", icon: <FileAddOutlined />, title: `Created${by}` };

  if (event.source === "approval") {
    const map: Record<string, Omit<Entry, "key" | "at">> = {
      requested: { color: "gold", icon: <SendOutlined />, title: `Asked for approval${by}` },
      approved: { color: "green", icon: <CheckCircleOutlined />, title: `Approved${by}` },
      self_approved: { color: "green", icon: <CheckCircleOutlined />, title: `Approved and sent (approver)${by}` },
      rejected: { color: "red", icon: <CloseCircleOutlined />, title: `Not approved${by}`, detail: event.note ? `“${event.note}”` : undefined },
      signed_uploaded: { color: "blue", icon: <UploadOutlined />, title: `Signed copy uploaded${by}`, detail: event.note ?? undefined },
      signed_confirmed: { color: "blue", icon: <SafetyCertificateOutlined />, title: `Scan checked and confirmed${by}` },
      signed_sent: { color: "green", icon: <FileDoneOutlined />, title: `Signed copy sent${by}` },
    };
    const entry = map[event.action];
    return entry ? { key, at, ...entry } : null;
  }

  if (event.source === "email") {
    const failed = event.status && event.status !== "sent";
    return {
      key,
      at,
      color: failed ? "red" : "cyan",
      icon: <MailOutlined />,
      title: failed ? `Email not sent to ${event.recipient ?? "—"}` : `Emailed ${event.recipient ?? ""}`,
      detail: (
        <>
          {event.summary}
          {event.cc?.length ? <div>CC: {event.cc.join(", ")}</div> : null}
          {failed && event.note ? <div style={{ color: "#cf1322" }}>{event.note}</div> : null}
        </>
      ),
    };
  }

  // A change to the row.
  if (event.action === "create") return null;
  if (event.action === "delete") return { key, at, color: "red", icon: <StopOutlined />, title: `Deleted${by}` };
  const changes = Object.entries(event.changes ?? {}).filter(([field]) => !QUIET.has(field));
  if (changes.length === 0) return null;
  const status = changes.find(([field]) => field === "status");
  const priced = changes.some(([field]) => PRICED.has(field));
  const fields = changes.filter(([field]) => field !== "status" && !PRICED.has(field)).map(([field]) => label(field));
  const title = status
    ? `${STATUS_LABEL[String(status[1])] ?? `Status: ${String(status[1])}`}${by}`
    : priced && fields.length === 0
      ? `Lines or prices changed${by}`
      : `Edited${by}`;
  const detail = [priced && (status || fields.length) ? "Lines or prices changed" : null, fields.length ? fields.join(", ") : null].filter(Boolean).join(" · ");
  const color = status && ["cancelled", "void", "declined"].includes(String(status[1])) ? "red" : status ? "green" : "blue";
  return { key, at, color, icon: status ? <CheckCircleOutlined /> : <EditOutlined />, title, detail: detail || undefined, changes };
}

function Changes({ changes }: { changes: [string, unknown][] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="link" size="small" style={{ padding: 0, height: "auto" }} onClick={() => setOpen(!open)}>
        {open ? "Hide changes" : "Show changes"}
      </Button>
      {open ? (
        <Flex vertical gap={2} style={{ marginTop: 4, fontSize: 12 }}>
          {changes.map(([field, value]) => (
            <div key={field}>
              <Typography.Text type="secondary">{label(field)} → </Typography.Text>
              <Typography.Text style={{ fontSize: 12 }}>{show(value)}</Typography.Text>
            </div>
          ))}
        </Flex>
      ) : null}
    </>
  );
}

export function DocumentHistory({ type, id }: { type: DocumentType; id: string }) {
  const { data, isLoading } = useQuery({ queryKey: ["history", type, id], queryFn: () => loadHistory(type, id) });
  if (isLoading) return <Spin />;
  const entries = (data ?? []).map(describe).filter((entry): entry is Entry => entry !== null);
  if (entries.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing recorded yet." />;
  return (
    <Timeline
      items={entries.map((entry) => ({
        key: entry.key,
        color: entry.color,
        icon: entry.icon,
        content: (
          <>
            <Typography.Text strong>{entry.title}</Typography.Text>
            <br />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {when(entry.at)}
            </Typography.Text>
            {entry.detail ? <div style={{ marginTop: 2, fontSize: 13 }}>{entry.detail}</div> : null}
            {entry.changes?.length ? <Changes changes={entry.changes} /> : null}
          </>
        ),
      }))}
    />
  );
}

export const HistoryLegend = () => (
  <Flex gap={6} wrap>
    <Tag>Changes</Tag>
    <Tag>Approvals</Tag>
    <Tag>Signed copies</Tag>
    <Tag>Emails</Tag>
  </Flex>
);
