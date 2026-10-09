import { Alert, Button, Flex, Typography, Upload, theme } from "antd";
import { DeleteOutlined, EyeOutlined, FileImageOutlined, FilePdfOutlined, PaperClipOutlined, SwapOutlined, UndoOutlined } from "@ant-design/icons";
import { useState } from "react";
import { formatBytes } from "@/lib/media";
import { purchaseOrderProblem } from "./api";

/** What happens to the PO file on save: keep it, use a new one, or take it off. */
export type PurchaseOrderChange = { kind: "keep" } | { kind: "replace"; file: File } | { kind: "remove" };

const fileIcon = (name: string) => (/\.(jpe?g|png)$/i.test(name) ? <FileImageOutlined /> : <FilePdfOutlined />);

/**
 * The customer's purchase order: attached on save. Shows the file that is
 * there (view, replace, remove) or a drop zone; the choice is kept until the
 * form is saved.
 */
export function PurchaseOrderField({
  current,
  change,
  onChange,
  onView,
  disabled = false,
}: {
  current: { name: string } | null;
  change: PurchaseOrderChange;
  onChange: (change: PurchaseOrderChange) => void;
  onView?: () => void;
  disabled?: boolean;
}) {
  const { token } = theme.useToken();
  const [problem, setProblem] = useState<string | null>(null);

  const pick = (file: File) => {
    const reason = purchaseOrderProblem(file);
    setProblem(reason);
    if (!reason) onChange({ kind: "replace", file });
    return false;
  };
  const picker = (children: React.ReactNode) => (
    <Upload accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" showUploadList={false} beforeUpload={pick} disabled={disabled}>
      {children}
    </Upload>
  );

  const shown = change.kind === "replace" ? { name: change.file.name, size: change.file.size, fresh: true } : change.kind === "keep" && current ? { name: current.name, size: null, fresh: false } : null;

  return (
    <Flex vertical gap={8}>
      {shown ? (
        <Flex
          align="center"
          gap={12}
          style={{
            padding: "10px 12px",
            borderRadius: token.borderRadiusLG,
            border: `1px solid ${shown.fresh ? token.colorPrimaryBorder : token.colorBorderSecondary}`,
            background: shown.fresh ? token.colorPrimaryBg : token.colorFillQuaternary,
          }}
        >
          <span style={{ fontSize: 22, color: token.colorPrimary, lineHeight: 1 }}>{fileIcon(shown.name)}</span>
          <Flex vertical style={{ minWidth: 0, flex: 1 }}>
            <Typography.Text strong ellipsis={{ tooltip: shown.name }}>
              {shown.name}
            </Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {shown.fresh ? `${shown.size ? `${formatBytes(shown.size)} · ` : ""}attached when you save` : "Shown after the invoice in the customer's PDF"}
            </Typography.Text>
          </Flex>
          <Flex gap={2}>
            {!shown.fresh && onView ? <Button type="text" size="small" icon={<EyeOutlined />} onClick={onView} aria-label="View the purchase order" /> : null}
            {picker(<Button type="text" size="small" icon={<SwapOutlined />} disabled={disabled} aria-label="Use another file" />)}
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              disabled={disabled}
              aria-label="Take the purchase order off"
              onClick={() => onChange(current && change.kind === "replace" ? { kind: "keep" } : current ? { kind: "remove" } : { kind: "keep" })}
            />
          </Flex>
        </Flex>
      ) : (
        <Upload.Dragger
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          showUploadList={false}
          beforeUpload={pick}
          disabled={disabled}
          style={{ padding: "4px 0" }}
        >
          <Flex vertical align="center" gap={2}>
            <PaperClipOutlined style={{ fontSize: 20, color: token.colorTextTertiary }} />
            <Typography.Text>Attach the customer's PO</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Optional · PDF, JPG or PNG, up to 15 MB · shown after the invoice
            </Typography.Text>
          </Flex>
        </Upload.Dragger>
      )}
      {change.kind === "remove" && current ? (
        <Alert
          type="warning"
          showIcon
          title={`${current.name} will be taken off when you save.`}
          action={
            <Button size="small" type="text" icon={<UndoOutlined />} onClick={() => onChange({ kind: "keep" })}>
              Keep it
            </Button>
          }
        />
      ) : null}
      {problem ? <Alert type="error" showIcon title={problem} /> : null}
    </Flex>
  );
}
