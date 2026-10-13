import { Fragment } from "react";
import { Empty, Flex, Tag, Typography, theme } from "antd";
import { CheckOutlined } from "@ant-design/icons";

export type LineGroup = { id: string; label: string; quantity: number; subtotal: number | string; kind?: string | null };
export type LineItem = {
  id: string;
  group_id: string | null;
  description: string;
  detail: string | null;
  amount: number | string;
  edition_id: string | null;
  /** Custom items: their category; sub-lines of a breakdown or lump sum point at it. */
  category_name?: string | null;
  parent_id?: string | null;
  pricing?: string | null;
};

/**
 * What a quotation or invoice sells, as the builder shows it: per server
 * group, a table of module and price | included; additional items (hardware,
 * services) with their category, sub-lines indented. Read-only — lines and prices
 * are changed in the quotation builder.
 */
export function DocumentLines({ groups, items, money }: { groups: LineGroup[]; items: LineItem[]; money: (amount: number) => string }) {
  const { token } = theme.useToken();
  if (groups.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No lines." />;
  const grid = {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 64px",
    gap: 1,
    background: token.colorBorderSecondary,
    border: `1px solid ${token.colorBorderSecondary}`,
    borderRadius: token.borderRadiusLG,
    overflow: "hidden",
  } as const;
  const head = { background: token.colorFillTertiary, padding: "8px 12px" };
  const cell = { background: token.colorBgContainer };

  return (
    <Flex vertical gap={12}>
      {groups.map((group) => {
        const lines = items.filter((item) => item.group_id === group.id);
        const parents = new Map(lines.map((item) => [item.id, item]));
        // A breakdown's price is its lines' total; a lump sum's lines carry no price.
        const priceText = (item: LineItem) => {
          if (item.pricing === "breakdown") return money(lines.filter((line) => line.parent_id === item.id).reduce((sum, line) => sum + Number(line.amount), 0));
          if (item.parent_id && parents.get(item.parent_id)?.pricing === "lump_sum") return "In the lump sum";
          return Number(item.amount) === 0 ? "No charge" : money(Number(item.amount));
        };
        return (
          <div key={group.id} style={grid}>
            <Flex align="center" justify="space-between" gap={8} style={head}>
              <span style={{ minWidth: 0 }}>
                <Typography.Text strong style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>
                  {group.label}
                </Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {" "}
                  {group.kind === "shared" ? "" : ` · ${group.quantity} server${group.quantity === 1 ? "" : "s"}`}
                </Typography.Text>
              </span>
              <Typography.Text strong style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                {money(Number(group.subtotal))}
              </Typography.Text>
            </Flex>
            <Flex align="center" justify="center" style={head}>
              <Typography.Text type="secondary" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>
                Incl.
              </Typography.Text>
            </Flex>
            {lines.map((item) => (
              <Fragment key={item.id}>
                <div style={{ ...cell, padding: item.parent_id ? "7px 12px 7px 28px" : "9px 12px", minWidth: 0 }}>
                  <Flex align="center" gap={6} wrap>
                    <Typography.Text strong={item.pricing === "breakdown"}>{item.description}</Typography.Text>
                    {item.category_name && !item.parent_id ? (
                      <Tag bordered={false} color="geekblue" style={{ marginInlineEnd: 0, fontSize: 11, lineHeight: "16px", paddingInline: 5 }}>
                        {item.category_name}
                      </Tag>
                    ) : null}
                    {item.edition_id ? (
                      <Tag bordered={false} color="orange" style={{ marginInlineEnd: 0, fontSize: 11, lineHeight: "16px", paddingInline: 5 }}>
                        In edition
                      </Tag>
                    ) : null}
                  </Flex>
                  <Typography.Text type="secondary" style={{ fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
                    {priceText(item)}
                    {item.detail ? ` · ${item.detail}` : ""}
                  </Typography.Text>
                </div>
                <Flex align="center" justify="center" style={cell}>
                  <CheckOutlined style={{ color: token.colorPrimary }} aria-label="Included" />
                </Flex>
              </Fragment>
            ))}
          </div>
        );
      })}
    </Flex>
  );
}
