import { Tag, Tooltip, Typography } from "antd";
import { MailOutlined } from "@ant-design/icons";
import { quotationState, type Quotation } from "@/lib/quotations";

const TONE_COLOR: Record<string, string> = { draft: "default", open: "processing", expired: "warning", won: "success", closed: "default" };

export function QuotationStatusTag({ quotation }: { quotation: Pick<Quotation, "status" | "valid_until"> }) {
  const state = quotationState(quotation);
  return <Tag color={TONE_COLOR[state.tone]}>{state.label}</Tag>;
}

/** "+2 in CC", with the addresses on hover. */
export function CcNote({ cc }: { cc: string[] | null | undefined }) {
  if (!cc?.length) return null;
  return (
    <Tooltip
      title={
        <>
          Also emailed (CC):
          {cc.map((email) => (
            <div key={email}>{email}</div>
          ))}
        </>
      }
    >
      <Typography.Text type="secondary" style={{ fontSize: 12, cursor: "default" }}>
        <MailOutlined /> +{cc.length} in CC
      </Typography.Text>
    </Tooltip>
  );
}
