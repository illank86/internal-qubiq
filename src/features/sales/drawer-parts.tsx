import { Flex, Typography, theme } from "antd";

/**
 * Pieces the quotation and invoice drawers share, so the two read alike: a
 * row of headline figures, titled sections of label / value pairs, and the
 * totals under the lines.
 */

/** The headline figures across the top of a drawer: the amount first, then dates and counts. */
export function StatRow({ stats }: { stats: { label: string; value: React.ReactNode; strong?: boolean }[] }) {
  const { token } = theme.useToken();
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fit, minmax(140px, 1fr))`,
        gap: 1,
        background: token.colorBorderSecondary,
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: token.borderRadiusLG,
        overflow: "hidden",
      }}
    >
      {stats.map((stat) => (
        <div key={stat.label} style={{ background: token.colorBgContainer, padding: "12px 16px", minWidth: 0 }}>
          <Typography.Text type="secondary" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, display: "block" }}>
            {stat.label}
          </Typography.Text>
          <Typography.Text
            strong
            style={{
              fontSize: stat.strong ? 20 : 15,
              color: stat.strong ? token.colorPrimary : undefined,
              fontVariantNumeric: "tabular-nums",
              display: "block",
              marginTop: 2,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {stat.value}
          </Typography.Text>
        </div>
      ))}
    </div>
  );
}

/** A titled block of label / value pairs, two to a row (one on a phone). */
export function InfoSection({ title, items, extra }: { title: string; items: { label: string; value: React.ReactNode; wide?: boolean }[]; extra?: React.ReactNode }) {
  return (
    <section>
      <Flex justify="space-between" align="center" style={{ marginBottom: 10 }}>
        <Typography.Text strong style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>
          {title}
        </Typography.Text>
        {extra}
      </Flex>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "14px 24px" }}>
        {items.map((item) => (
          <div key={item.label} style={{ minWidth: 0, gridColumn: item.wide ? "1 / -1" : undefined }}>
            <Typography.Text type="secondary" style={{ fontSize: 12, display: "block" }}>
              {item.label}
            </Typography.Text>
            <div style={{ marginTop: 2, wordBreak: "break-word" }}>{item.value ?? "—"}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Subtotal, tax and total, right-aligned under the lines. */
export function Totals({ rows, total }: { rows: { label: string; value: string }[]; total: { label: string; value: string } }) {
  const { token } = theme.useToken();
  return (
    <Flex justify="flex-end">
      <Flex vertical gap={6} style={{ width: "100%", maxWidth: 320 }}>
        {rows.map((row) => (
          <Flex key={row.label} justify="space-between">
            <Typography.Text type="secondary">{row.label}</Typography.Text>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{row.value}</span>
          </Flex>
        ))}
        <Flex justify="space-between" align="center" style={{ marginTop: 4, padding: "10px 12px", borderRadius: token.borderRadius, background: token.colorPrimaryBg }}>
          <Typography.Text strong>{total.label}</Typography.Text>
          <Typography.Text strong style={{ fontSize: 16, color: token.colorPrimary, fontVariantNumeric: "tabular-nums" }}>
            {total.value}
          </Typography.Text>
        </Flex>
      </Flex>
    </Flex>
  );
}

/** "Where it stands": approval, and the signed copy when it goes out signed. */
export function StandingPanel({ children }: { children: React.ReactNode }) {
  const { token } = theme.useToken();
  return (
    <Flex vertical gap={8} align="flex-start" style={{ padding: "12px 16px", borderRadius: token.borderRadiusLG, background: token.colorFillQuaternary }}>
      {children}
    </Flex>
  );
}
