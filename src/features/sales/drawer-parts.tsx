import { useLayoutEffect, useRef } from "react";
import { Flex, Grid, Typography, theme } from "antd";

/**
 * Pieces the quotation and invoice drawers share, so the two read alike: a
 * row of headline figures, titled sections of label / value pairs, and the
 * totals under the lines.
 */

/** The headline figures across the top of a drawer: the amount first, then dates and counts. */
export function StatRow({ stats }: { stats: { label: string; value: React.ReactNode; strong?: boolean }[] }) {
  const { token } = theme.useToken();
  const wide = Grid.useBreakpoint().md;
  const lead = stats[0]?.strong;
  // One row, the amount a little wider; on a phone the amount takes the top
  // row and the rest share the one under it, so no figure is left on its own.
  const columns = wide || !lead ? `${lead ? "minmax(0, 1.5fr) " : ""}repeat(${lead ? stats.length - 1 : stats.length}, minmax(0, 1fr))` : `repeat(${stats.length - 1}, minmax(0, 1fr))`;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: columns,
        gap: 1,
        background: token.colorBorderSecondary,
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: token.borderRadiusLG,
        overflow: "hidden",
      }}
    >
      {stats.map((stat, index) => (
        <div key={stat.label} style={{ background: token.colorBgContainer, padding: wide ? "12px 16px" : "10px 12px", minWidth: 0, gridColumn: !wide && lead && index === 0 ? "1 / -1" : undefined }}>
          <Typography.Text type="secondary" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, display: "block" }}>
            {stat.label}
          </Typography.Text>
          {stat.strong && typeof stat.value === "string" ? (
            <div style={{ marginTop: 2 }}>
              <Amount value={stat.value} size={22} color={token.colorPrimary} />
            </div>
          ) : (
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
          )}
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
      <Flex vertical gap={6} style={{ width: "100%", maxWidth: 360 }}>
        {rows.map((row) => (
          <Flex key={row.label} justify="space-between" gap={12} wrap>
            <Typography.Text type="secondary">{row.label}</Typography.Text>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{row.value}</span>
          </Flex>
        ))}
        <Flex justify="space-between" align="center" gap={12} style={{ marginTop: 4, padding: "10px 12px", borderRadius: token.borderRadius, background: token.colorPrimaryBg }}>
          <Typography.Text strong>{total.label}</Typography.Text>
          <div style={{ flex: 1, minWidth: 0, textAlign: "right" }}>
            <Amount value={total.value} size={16} color={token.colorPrimary} />
          </div>
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

/**
 * A money figure that always stays on one line and in full: the currency code
 * and the decimals are set small and quiet so the whole number reads first,
 * and the type steps down smoothly (to a floor) when the digits outgrow the
 * box, never abbreviated to K or M.
 */
export function Amount({ value, size, color, min = 12 }: { value: string; size: number; color?: string; min?: number }) {
  const { token } = theme.useToken();
  const box = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const outer = box.current;
    const inner = text.current;
    if (!outer || !inner) return;
    const fit = () => {
      inner.style.fontSize = `${size}px`;
      const room = outer.clientWidth;
      const need = inner.scrollWidth;
      inner.style.fontSize = `${need > room && room > 0 ? Math.max(min, Math.floor((size * room) / need * 10) / 10) : size}px`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(outer);
    return () => observer.disconnect();
  }, [value, size, min]);

  // "IDR 1,234,567.00" → currency "IDR ", whole "1,234,567", fraction ".00"
  const match = /^(.*?)(\d[\d,]*)(\.\d+)?(.*)$/.exec(value);
  const [, lead = "", whole = value, fraction = "", tail = ""] = match ?? [];
  const negative = lead.includes("-");
  const code = lead.replace("-", "").trim();
  const quiet = { fontSize: "0.62em", fontWeight: 500, color: token.colorTextSecondary };

  return (
    <div ref={box} title={value} style={{ overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", lineHeight: 1.25 }}>
      <span ref={text} style={{ fontSize: size, fontWeight: 700, color, fontVariantNumeric: "tabular-nums", letterSpacing: -0.2 }}>
        {negative ? "−" : null}
        {code ? <span style={{ ...quiet, marginRight: "0.3em" }}>{code}</span> : null}
        {whole}
        {fraction ? <span style={quiet}>{fraction}</span> : null}
        {tail}
      </span>
    </div>
  );
}
