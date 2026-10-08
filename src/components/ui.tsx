import { Card, Flex, Spin, Typography } from "antd";

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

/** The frame every signed-out screen shares: sign in, forgot, set password. */
export function AuthCard({ title, intro, children }: { title: string; intro: React.ReactNode; children: React.ReactNode }) {
  return (
    <Flex align="center" justify="center" style={{ minHeight: "100dvh", padding: "48px 16px" }}>
      <Flex vertical gap={24} style={{ width: "100%", maxWidth: 420 }}>
        <Flex vertical align="center" gap={12} style={{ textAlign: "center" }}>
          <Brand />
          <div>
            <Typography.Title level={3} style={{ margin: 0 }}>
              {title}
            </Typography.Title>
            <Typography.Paragraph type="secondary" style={{ margin: "8px 0 0" }}>
              {intro}
            </Typography.Paragraph>
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
