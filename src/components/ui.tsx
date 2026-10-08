import { Card, Flex, Spin, Typography } from "antd";
import { QubiqMark, QubiqWordmark } from "./brand";

/** The logo and the app's name, for the sidebar and the header on small screens. */
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Flex align="center" gap={10}>
      {/* The logo draws in the text colour, so it follows the theme. */}
      <Typography.Text style={{ lineHeight: 0 }}>{compact ? <QubiqMark style={{ height: 28, width: "auto" }} /> : <Logo height={18} />}</Typography.Text>
      {compact ? null : (
        <Typography.Text type="secondary" style={{ fontSize: 13, whiteSpace: "nowrap", borderLeft: "1px solid rgba(127,127,127,0.35)", paddingLeft: 10 }}>
          Admin
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
