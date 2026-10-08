import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Flex, Grid, Modal, Space, Spin, Tooltip, Typography } from "antd";
import { DownloadOutlined, ExportOutlined, SendOutlined } from "@ant-design/icons";
import { Recipients } from "./email-list-input";
import { PdfViewerContext, type PdfRequest } from "./pdf-viewer-context";

type Shown = {
  title: string;
  fileName: string;
  url: string | null;
  error: string | null;
  action?: PdfRequest["action"];
  note?: string;
  recipients?: PdfRequest["recipients"];
};

/**
 * The internal app's PDF viewer: quotations and invoices open here first,
 * rendered in the browser, with Download and Open in a new tab (printing is
 * in the browser's own viewer toolbar) — not
 * as a download. Customers' PDF links on the website are unchanged.
 *
 * The page is the browser's own PDF viewer in a frame, so search, zoom and
 * page thumbnails work as people expect. Phones often cannot show a PDF in
 * a frame; there the viewer offers the download instead.
 */
export function PdfViewerProvider({ children }: { children: React.ReactNode }) {
  const [shown, setShown] = useState<Shown | null>(null);
  const [acting, setActing] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const request = useRef(0);
  const screens = Grid.useBreakpoint();
  const small = !screens.md;

  const open = useCallback((pdf: PdfRequest) => {
    const id = ++request.current;
    setShown({ title: pdf.title, fileName: pdf.fileName, url: null, error: null, action: pdf.action, note: pdf.note, recipients: pdf.recipients });
    pdf
      .make()
      .then((blob) => {
        // Closed, or another PDF opened, while this one was rendering.
        if (id !== request.current) return;
        setShown((current) => (current ? { ...current, url: URL.createObjectURL(blob) } : current));
      })
      .catch((error: unknown) => {
        console.error("[pdf]", error);
        if (id === request.current) setShown((current) => (current ? { ...current, error: "The PDF could not be made. Please try again." } : current));
      });
  }, []);

  const close = () => {
    request.current += 1;
    setShown(null);
  };

  // Each rendered PDF is released when it is replaced or closed.
  const url = shown?.url;
  useEffect(() => {
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);

  return (
    <PdfViewerContext.Provider value={open}>
      {children}
      <Modal
        open={shown !== null}
        onCancel={close}
        footer={null}
        width={small ? "100%" : "min(1100px, 92vw)"}
        centered
        destroyOnHidden
        styles={{ body: { padding: 0 } }}
        title={
          <Flex justify="space-between" align="center" gap={12} wrap style={{ paddingRight: 32 }}>
            <Flex vertical style={{ minWidth: 0 }}>
              <Typography.Text strong ellipsis style={{ maxWidth: small ? "100%" : 420 }}>
                {shown?.title}
              </Typography.Text>
              {shown?.note ? (
                <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>
                  {shown.note}
                </Typography.Text>
              ) : null}
            </Flex>
            <Space size={8} wrap>
              {shown?.action ? (
                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  loading={acting}
                  disabled={!url}
                  onClick={async () => {
                    setActing(true);
                    try {
                      await shown.action!.onClick();
                      close();
                    } finally {
                      setActing(false);
                    }
                  }}
                >
                  {shown.action.label}
                </Button>
              ) : null}
              <Button type={shown?.action ? "default" : "primary"} icon={<DownloadOutlined />} href={url ?? undefined} download={shown?.fileName} disabled={!url}>
                Download
              </Button>
              <Tooltip title="Open in a new tab">
                <Button icon={<ExportOutlined />} href={url ?? undefined} target="_blank" rel="noopener" disabled={!url} aria-label="Open in a new tab" />
              </Tooltip>
            </Space>
          </Flex>
        }
      >
        {shown?.recipients ? (
          <div style={{ padding: "10px 24px", borderBottom: "1px solid rgba(127,127,127,0.15)" }}>
            <Recipients to={shown.recipients.to} cc={shown.recipients.cc} />
          </div>
        ) : null}
        <div style={{ height: small ? "70dvh" : "80vh", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(127,127,127,0.08)" }}>
          {shown?.error ? (
            <Alert type="error" showIcon title={shown.error} />
          ) : !url ? (
            <Spin size="large" description="Preparing the PDF…" />
          ) : small ? (
            <Flex vertical align="center" gap={12} style={{ padding: 24, textAlign: "center" }}>
              <Typography.Text type="secondary">This screen cannot show the PDF here.</Typography.Text>
              <Button type="primary" icon={<DownloadOutlined />} href={url} download={shown?.fileName}>
                Download {shown?.fileName}
              </Button>
            </Flex>
          ) : (
            <iframe ref={frame} title={shown?.title} src={url} style={{ width: "100%", height: "100%", border: 0 }} />
          )}
        </div>
      </Modal>
    </PdfViewerContext.Provider>
  );
}
