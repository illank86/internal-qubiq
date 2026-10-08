import { Card, Flex, Spin, Typography } from "antd";
import { QubiqMark, QubiqWordmark } from "./brand";

/** The QUBIQ mark and name, used in the sidebar and on sign-in screens. */
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Flex align="center" gap={10}>
      <img src="/qubiq-mark.svg" alt="" width={28} height={28} />
      {compact ? null : (
        <Typography.Text strong style={{ fontSize: 15, whiteSpace: "nowrap" }}>
          QUBIQ <Typography.Text type="secondary">Internal</Typography.Text>
        </Typography.Text>
      )}
    </Flex>
  );
}

/** The QUBIQ logo, drawn in the current text colour so it suits light and dark. */
export function Logo({ height = 40 }: { height?: number }) {
  return (
    <Flex align="center" gap={height * 0.2} aria-label="QUBIQ" role="img">
      <QubiqMark style={{ height: height * 1.43, width: "auto" }} />
      <QubiqWordmark style={{ height, width: "auto" }} />
    </Flex>
  );
}

/** The frame every signed-out screen shares: sign in, forgot, set password. */
export function AuthCard({ title, intro, children }: { title?: string; intro: React.ReactNode; children: React.ReactNode }) {
  return (
    <Flex align="center" justify="center" style={{ minHeight: "100dvh", padding: "48px 16px" }}>
      <Flex vertical gap={28} style={{ width: "100%", maxWidth: 400 }}>
        <Flex vertical align="center" gap={16} style={{ textAlign: "center" }}>
          <Typography.Text style={{ lineHeight: 0 }}>
            <Logo height={30} />
          </Typography.Text>
          <div>
            {title ? (
              <Typography.Title level={4} style={{ margin: 0 }}>
                {title}
              </Typography.Title>
            ) : null}
            <Typography.Text type="secondary" style={{ display: "block", marginTop: title ? 6 : 0 }}>
              {intro}
            </Typography.Text>
          </div>
        </Flex>
        <Card>{children}</Card>
      </Flex>
    </Flex>
  );
}

export function FullPageSpinner() {
  return (
    <Flex align="center" justify="center" style={{ minHeight: "100dvh" }}>
      <Spin size="large" />
    </Flex>
  );
}
