import { useState } from "react";
import { Alert, Button, Flex, Form, Input, Modal, Tag, Tooltip, Typography, Upload } from "antd";
import { CheckCircleOutlined, DownloadOutlined, EditOutlined, EyeOutlined, FileDoneOutlined, SafetyCertificateOutlined, SendOutlined, UploadOutlined } from "@ant-design/icons";
import { usePdfViewer } from "@/components/pdf-viewer-context";
import {
  confirmSignedCopy,
  invoicePdf,
  quotationPdf,
  sendSignedCopy,
  signingState,
  uploadSignedCopy,
  type DocumentType,
  type SigningState,
} from "./api";
import type { useAction } from "./use-action";

/**
 * Documents that go out as a signed copy — signed by hand, or (invoices) with
 * a physical materai or an e-Meterai. Once approved: download, sign or stamp,
 * upload; a checked copy can be sent, a scan waits for an approver.
 */

export type SignableRow = {
  id: string;
  number: string | null;
  signature_mode: string;
  materai?: string | null;
  approval_status: string;
  signed_copy_path: string | null;
  signed_copy_check: string | null;
  signed_copy_confirmed_at: string | null;
  signed_copy_sent_at: string | null;
};

const STATE_TAG: Record<Exclude<SigningState, "none">, { color: string; label: string; hint: string; icon: React.ReactNode }> = {
  to_sign: { color: "orange", label: "To sign", hint: "Approved. Download it, sign or stamp it, then upload the signed copy.", icon: <EditOutlined /> },
  needs_check: { color: "gold", label: "Scan · check needed", hint: "A scanned copy was uploaded. An approver confirms it before it is sent.", icon: <SafetyCertificateOutlined /> },
  ready: { color: "blue", label: "Signed · ready to send", hint: "The signed copy is checked. Send it to the customer.", icon: <FileDoneOutlined /> },
  sent: { color: "green", label: "Signed copy sent", hint: "The customer has the signed copy.", icon: <CheckCircleOutlined /> },
};

export function SigningTag({ row }: { row: SignableRow }) {
  const state = signingState(row);
  if (state === "none") return null;
  const tag = STATE_TAG[state];
  return (
    <Tooltip title={tag.hint}>
      <Tag color={tag.color} icon={tag.icon} style={{ marginInlineEnd: 0 }}>
        {tag.label}
      </Tag>
    </Tooltip>
  );
}

const pdfFor = (type: DocumentType, row: SignableRow, original = false) => (type === "invoice" ? invoicePdf(row.id, row.number, { original }) : quotationPdf(row.id, row.number, { original }));

/** Upload the signed or stamped copy; it is checked against the approved version. */
export function UploadSignedModal({
  open,
  type,
  row,
  onClose,
  onUploaded,
}: {
  open: boolean;
  type: DocumentType;
  row: SignableRow;
  onClose: () => void;
  onUploaded: (check: "verified" | "unreadable") => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [serial, setSerial] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eMeterai = row.materai === "e_meterai";

  const submit = async () => {
    if (!file) return setError("Choose the signed PDF.");
    setPending(true);
    setError(null);
    try {
      const check = await uploadSignedCopy(type, row.id, file, serial);
      setFile(null);
      setSerial("");
      onUploaded(check);
    } catch (cause) {
      setError((cause as { message?: string }).message ?? "The signed copy could not be uploaded.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      open={open}
      title={`Upload the signed copy · ${row.number ?? ""}`}
      okText="Upload and check"
      okButtonProps={{ loading: pending, disabled: !file }}
      onOk={submit}
      onCancel={onClose}
      destroyOnHidden
    >
      <Typography.Paragraph type="secondary">
        {eMeterai
          ? "Upload the PDF your e-Meterai provider stamped. It is checked to be this approved version, then it can be sent."
          : "Upload the signed PDF — a scan of the signed paper, or a PDF signed or stamped another way. A scan cannot be read automatically, so an approver confirms it before it is sent."}
      </Typography.Paragraph>
      <Upload.Dragger
        accept="application/pdf,.pdf"
        multiple={false}
        showUploadList={false}
        beforeUpload={(chosen) => {
          setError(null);
          if (chosen.type !== "application/pdf") setError("Use a PDF.");
          else if (chosen.size > 15 * 1024 * 1024) setError("Use a PDF under 15 MB.");
          else setFile(chosen);
          return false;
        }}
        style={{ marginBottom: 16 }}
      >
        <p className="ant-upload-drag-icon">
          <UploadOutlined />
        </p>
        <p className="ant-upload-text">{file ? file.name : "Drop the signed PDF here, or click to choose it"}</p>
        <p className="ant-upload-hint">PDF, up to 15 MB</p>
      </Upload.Dragger>
      {eMeterai ? (
        <Form layout="vertical">
          <Form.Item label="e-Meterai serial number" extra="Optional. Printed with the stamp; it lets anyone trace it on Peruri's site.">
            <Input value={serial} onChange={(event) => setSerial(event.target.value)} maxLength={64} placeholder="e.g. 0A1B2C3D4E5F6G7H8I9J0K" />
          </Form.Item>
        </Form>
      ) : null}
      {error ? <Alert type="error" showIcon title={error} /> : null}
    </Modal>
  );
}

/**
 * The next step for a document that goes out signed, as buttons: download to
 * sign, upload, confirm a scan (approvers), send the signed copy.
 */
export function SigningActions({
  type,
  row,
  isApprover,
  run,
  busy,
  size = "small",
  showView = false,
}: {
  type: DocumentType;
  row: SignableRow;
  isApprover: boolean;
  run: ReturnType<typeof useAction>["run"];
  busy: string | null;
  size?: "small" | "middle";
  showView?: boolean;
}) {
  const viewPdf = usePdfViewer();
  const [uploading, setUploading] = useState(false);
  const state = signingState(row);
  if (state === "none") return null;
  const k = (name: string) => `${name}:${row.id}`;
  const download = (
    <Button size={size} type={state === "to_sign" ? "primary" : "default"} icon={<DownloadOutlined />} onClick={() => viewPdf({ ...pdfFor(type, row, true), note: "Print and sign it, or stamp it on your e-Meterai provider's site — then upload the signed copy." })}>
      {state === "to_sign" ? "Download to sign" : "Download again"}
    </Button>
  );
  const upload = (
    <Button size={size} icon={<UploadOutlined />} onClick={() => setUploading(true)}>
      {row.signed_copy_path ? "Upload a new copy" : "Upload signed copy"}
    </Button>
  );
  const view = (
    <Button size={size} icon={<EyeOutlined />} onClick={() => viewPdf(pdfFor(type, row))}>
      View signed copy
    </Button>
  );

  return (
    <Flex gap={6} wrap align="center" onClick={(event) => event.stopPropagation()}>
      {state === "to_sign" ? (
        <>
          {download}
          {upload}
        </>
      ) : state === "needs_check" ? (
        <>
          {isApprover ? (
            <Button
              size={size}
              type="primary"
              icon={<SafetyCertificateOutlined />}
              loading={busy === k("confirm")}
              onClick={() =>
                viewPdf({
                  ...pdfFor(type, row),
                  note: "A scan of the signed copy. Check it is the right document, signed (and stamped), before it goes to the customer.",
                  action: {
                    label: "Confirm & send",
                    onClick: async () => {
                      await run(k("confirm"), async () => {
                        await confirmSignedCopy(type, row.id);
                        await sendSignedCopy(type, row.id);
                      }, "Confirmed and sent to the customer.");
                    },
                  },
                })
              }
            >
              Check & send
            </Button>
          ) : (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Waiting for an approver to check the scan
            </Typography.Text>
          )}
          {showView ? view : null}
          {upload}
        </>
      ) : state === "ready" ? (
        <>
          <Button size={size} type="primary" icon={<SendOutlined />} loading={busy === k("send-signed")} onClick={() => run(k("send-signed"), () => sendSignedCopy(type, row.id), "The signed copy was sent to the customer.")}>
            Send signed copy
          </Button>
          {showView ? view : null}
          {upload}
        </>
      ) : showView ? (
        view
      ) : null}
      <UploadSignedModal
        open={uploading}
        type={type}
        row={row}
        onClose={() => setUploading(false)}
        onUploaded={(check) =>
          void run(
            k("uploaded"),
            async () => setUploading(false),
            check === "verified" ? "Checked: it is the approved version. You can send it now." : "Uploaded. An approver checks the scan, then it is sent.",
          )
        }
      />
    </Flex>
  );
}

/**
 * The signing steps as menu entries, for a row's ⋯ menu: download to sign,
 * upload, check a scan (approvers), send. Render `modal` alongside the menu.
 */
export function useSigningMenu({
  type,
  row,
  isApprover,
  run,
}: {
  type: DocumentType;
  row: SignableRow;
  isApprover: boolean;
  run: ReturnType<typeof useAction>["run"];
}) {
  const viewPdf = usePdfViewer();
  const [uploading, setUploading] = useState(false);
  const state = signingState(row);
  const k = (name: string) => `${name}:${row.id}`;
  const items: { key: string; icon: React.ReactNode; label: string; onClick: () => void }[] = [];
  if (state === "to_sign" || state === "needs_check" || state === "ready") {
    items.push({
      key: "download-sign",
      icon: <DownloadOutlined />,
      label: state === "to_sign" ? "Download to sign" : "Download again",
      onClick: () => viewPdf({ ...pdfFor(type, row, true), note: "Print and sign it, or stamp it on your e-Meterai provider's site — then upload the signed copy." }),
    });
    items.push({ key: "upload-signed", icon: <UploadOutlined />, label: row.signed_copy_path ? "Upload a new signed copy" : "Upload signed copy", onClick: () => setUploading(true) });
  }
  if (state === "needs_check" && isApprover) {
    items.unshift({
      key: "check-scan",
      icon: <SafetyCertificateOutlined />,
      label: "Check scan & send",
      onClick: () =>
        viewPdf({
          ...pdfFor(type, row),
          note: "A scan of the signed copy. Check it is the right document, signed (and stamped), before it goes to the customer.",
          action: {
            label: "Confirm & send",
            onClick: async () => {
              await run(k("confirm"), async () => {
                await confirmSignedCopy(type, row.id);
                await sendSignedCopy(type, row.id);
              }, "Confirmed and sent to the customer.");
            },
          },
        }),
    });
  }
  if (state === "ready") {
    items.unshift({ key: "send-signed", icon: <SendOutlined />, label: "Send signed copy", onClick: () => void run(k("send-signed"), () => sendSignedCopy(type, row.id), "The signed copy was sent to the customer.") });
  }
  if (state === "needs_check" || state === "ready" || state === "sent") {
    items.push({ key: "view-signed", icon: <EyeOutlined />, label: "View signed copy", onClick: () => viewPdf(pdfFor(type, row)) });
  }
  const modal = (
    <UploadSignedModal
      open={uploading}
      type={type}
      row={row}
      onClose={() => setUploading(false)}
      onUploaded={(check) =>
        void run(
          k("uploaded"),
          async () => setUploading(false),
          check === "verified" ? "Checked: it is the approved version. You can send it now." : "Uploaded. An approver checks the scan, then it is sent.",
        )
      }
    />
  );
  return { state, items, modal };
}
