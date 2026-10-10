import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Empty, Form, Input, Modal, Spin, Tag, Timeline, Tooltip, Typography } from "antd";
import { CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined, EditOutlined, SendOutlined } from "@ant-design/icons";
import { useStaff } from "@/auth/use-auth";
import { supabase } from "@/lib/supabase";
import { loadApprovalHistory, type ApprovalEntry, type DocumentType } from "./api";

/**
 * Approval of quotations and invoices, as the screens show it. The rules
 * live in the database (approve_document, reject_document, the guards):
 * these only show the state and call them.
 */

export type ApprovalState = "none" | "pending" | "approved" | "rejected";

/** Whether the signed-in person is on the approvers list (Users & roles). */
export function useIsApprover() {
  const staff = useStaff();
  const { data } = useQuery({
    queryKey: ["is-approver", staff.id],
    queryFn: async () => {
      const { data: row } = await supabase.from("document_approvers").select("user_id").eq("user_id", staff.id).maybeSingle();
      return Boolean(row);
    },
    staleTime: 60_000,
  });
  return data ?? false;
}

/**
 * Whether the current user's send approves it at once. False when they are
 * not an approver — and, with the four-eyes rule on (Sales settings), for an
 * approver whose own documents need another approver.
 */
export function useSendsDirectly(type: "quotation" | "invoice") {
  const staff = useStaff();
  const { data } = useQuery({
    queryKey: ["sends-directly", type, staff.id],
    queryFn: async () => {
      const { data: direct } = await supabase.rpc("sends_directly", { p_type: type });
      return Boolean(direct);
    },
    staleTime: 60_000,
  });
  return data ?? false;
}

const when = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

/**
 * Where a document stands with approval, under its status. Nothing for a
 * draft that has not been sent; "edited" for a sent quotation changed since
 * (the customer does not see it until it is approved again).
 */
export function ApprovalNote({
  state,
  note,
  requestedBy,
  approvedBy,
  approvedAt,
  edited = false,
}: {
  state: ApprovalState;
  note?: string | null;
  requestedBy?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  edited?: boolean;
}) {
  if (state === "pending") {
    return (
      <Tooltip title={requestedBy ? `Asked by ${requestedBy}. It goes to the customer once an approver approves it.` : "Waiting for an approver."}>
        <Tag color="gold" icon={<ClockCircleOutlined />} style={{ marginInlineEnd: 0 }}>
          Awaiting approval
        </Tag>
      </Tooltip>
    );
  }
  if (state === "rejected") {
    return (
      <Tooltip title={note ? `Reason: ${note}` : "Not approved."}>
        <Tag color="red" icon={<CloseCircleOutlined />} style={{ marginInlineEnd: 0 }}>
          Not approved
        </Tag>
      </Tooltip>
    );
  }
  if (edited) {
    return (
      <Tooltip title="Changed since it was approved. The customer's link is paused until it is sent again.">
        <Tag color="orange" icon={<EditOutlined />} style={{ marginInlineEnd: 0 }}>
          Edited · send again
        </Tag>
      </Tooltip>
    );
  }
  if (state === "approved" && approvedBy) {
    return (
      <Tooltip title={when(approvedAt)}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          <CheckCircleOutlined /> Approved by {approvedBy}
        </Typography.Text>
      </Tooltip>
    );
  }
  return null;
}

/** Reject, with the reason the person who asked will read. */
export function RejectModal({
  open,
  title,
  onCancel,
  onReject,
}: {
  open: boolean;
  title: string;
  onCancel: () => void;
  onReject: (reason: string) => Promise<unknown>;
}) {
  const [form] = Form.useForm<{ reason: string }>();
  const [pending, setPending] = useState(false);
  return (
    <Modal
      open={open}
      title={`Reject ${title}?`}
      okText="Reject"
      okButtonProps={{ danger: true, loading: pending }}
      onCancel={onCancel}
      destroyOnHidden
      onOk={async () => {
        const { reason } = await form.validateFields();
        setPending(true);
        try {
          await onReject(reason.trim());
        } finally {
          setPending(false);
        }
      }}
    >
      <Typography.Paragraph type="secondary">It is not sent. The person who asked is emailed your reason, and can change it and ask again.</Typography.Paragraph>
      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item name="reason" label="Reason" rules={[{ required: true, whitespace: true, message: "Say what needs changing" }, { max: 1000 }]}>
          <Input.TextArea rows={3} placeholder="e.g. Discount is above what we agreed; use 10%." autoFocus />
        </Form.Item>
      </Form>
    </Modal>
  );
}

const ENTRY: Record<ApprovalEntry["action"], { color: string; icon: React.ReactNode; label: string }> = {
  requested: { color: "gold", icon: <SendOutlined />, label: "asked for approval" },
  approved: { color: "green", icon: <CheckCircleOutlined />, label: "approved it" },
  self_approved: { color: "green", icon: <CheckCircleOutlined />, label: "sent it (approver)" },
  rejected: { color: "red", icon: <CloseCircleOutlined />, label: "rejected it" },
};

/** Every request and decision on a document, newest first. */
export function ApprovalHistoryModal({ type, id, title, open, onClose }: { type: DocumentType; id: string; title: string; open: boolean; onClose: () => void }) {
  const { data, isLoading } = useQuery({ queryKey: ["approvals", type, id], queryFn: () => loadApprovalHistory(type, id), enabled: open });
  return (
    <Modal open={open} title={`Approval history · ${title}`} onCancel={onClose} footer={null} destroyOnHidden>
      {isLoading ? (
        <Spin />
      ) : data && data.length > 0 ? (
        <Timeline
          style={{ marginTop: 16 }}
          items={data.map((entry) => ({
            color: ENTRY[entry.action].color,
            icon: ENTRY[entry.action].icon,
            content: (
              <>
                <Typography.Text strong>{entry.actor_name ?? "Someone"}</Typography.Text> {ENTRY[entry.action].label}
                <br />
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {when(entry.created_at)}
                </Typography.Text>
                {entry.note ? <Typography.Paragraph style={{ margin: "4px 0 0", whiteSpace: "pre-wrap" }}>“{entry.note}”</Typography.Paragraph> : null}
              </>
            ),
          }))}
        />
      ) : (
        <Empty description="Not sent through approval yet." image={Empty.PRESENTED_IMAGE_SIMPLE} />
      )}
    </Modal>
  );
}
