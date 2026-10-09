import { Button, Card, Checkbox, Flex, Input, InputNumber, Space, Tag, Tooltip, Typography, theme } from "antd";
import { CheckCircleFilled, CopyOutlined, DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { formatMoney } from "@/lib/invoices";
import { newGroup, type BuilderEdition, type BuilderModule, type GroupDraft } from "@/lib/sales";

/**
 * Server groups: one quotation can cover several servers, each group with its
 * own edition and modules and a number of identical servers. Choosing an
 * edition ticks its modules; anything added on top stays when it changes.
 */
export function ServerGroupsEditor({
  groups,
  onChange,
  editions,
  modules,
  subtotals,
  money,
}: {
  groups: GroupDraft[];
  onChange: (next: GroupDraft[]) => void;
  editions: BuilderEdition[];
  modules: BuilderModule[];
  subtotals: number[];
  money: (amount: number) => string;
}) {
  const categories = [...modules.reduce((map, item) => map.set(item.category, [...(map.get(item.category) ?? []), item]), new Map<string, BuilderModule[]>())];
  // An edition costs what its modules cost.
  const editionTotal = (edition: BuilderEdition) =>
    modules.filter((item) => edition.moduleIds.includes(item.id) && !item.percent).reduce((sum, item) => sum + item.price, 0);
  const update = (key: string, next: Partial<GroupDraft>) => onChange(groups.map((group) => (group.key === key ? { ...group, ...next } : group)));
  const { token } = theme.useToken();
  const sectionLabel = { fontSize: 12, textTransform: "uppercase", letterSpacing: 1 } as const;
  // A table of cells: the 1px gaps over a border-coloured background draw the rules.
  const grid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))",
    gap: 1,
    background: token.colorBorderSecondary,
    border: `1px solid ${token.colorBorderSecondary}`,
    borderRadius: token.borderRadiusLG,
    overflow: "hidden",
  } as const;

  return (
    <Flex vertical gap={16}>
      {groups.map((group, index) => {
        const edition = editions.find((item) => item.id === group.editionId);
        const baseCurrency = edition?.currency ?? editions[0]?.currency ?? "USD";
        const chooseEdition = (id: string) => {
          const before = new Set(edition?.moduleIds ?? []);
          const after = editions.find((item) => item.id === id)?.moduleIds ?? [];
          update(group.key, { editionId: id, moduleIds: [...new Set([...group.moduleIds.filter((moduleId) => !before.has(moduleId)), ...after])] });
        };
        return (
          <Card
            key={group.key}
            size="small"
            title={
              <Flex align="center" gap={8} wrap>
                <Typography.Text type="secondary">{index + 1}.</Typography.Text>
                <Input
                  value={group.label}
                  onChange={(event) => update(group.key, { label: event.target.value.slice(0, 120) })}
                  placeholder={`Server group ${index + 1}`}
                  aria-label={`Name of server group ${index + 1}`}
                  variant="filled"
                  style={{ fontWeight: 600, maxWidth: 300 }}
                />
              </Flex>
            }
            extra={
              <Space size={4}>
                <Typography.Text type="secondary">Servers</Typography.Text>
                <InputNumber
                  min={1}
                  max={1000}
                  value={group.quantity}
                  onChange={(value) => update(group.key, { quantity: Math.max(1, Math.min(1000, Number(value) || 1)) })}
                  style={{ width: 72 }}
                  aria-label="Number of servers"
                />
                <Typography.Text strong style={{ minWidth: 110, textAlign: "right", display: "inline-block" }}>
                  {money(subtotals[index] ?? 0)}
                </Typography.Text>
                <Tooltip title="Duplicate group">
                  <Button
                    type="text"
                    icon={<CopyOutlined />}
                    onClick={() =>
                      onChange([...groups.slice(0, index + 1), newGroup(editions, groups.length, { ...group, label: `${group.label} (copy)` }), ...groups.slice(index + 1)])
                    }
                  />
                </Tooltip>
                {groups.length > 1 ? (
                  <Tooltip title="Remove group">
                    <Button type="text" danger icon={<DeleteOutlined />} onClick={() => onChange(groups.filter((item) => item.key !== group.key))} />
                  </Tooltip>
                ) : null}
              </Space>
            }
          >
            <Typography.Text type="secondary" style={sectionLabel}>
              Edition
            </Typography.Text>
            <div role="radiogroup" aria-label="Edition" style={{ ...grid, gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", margin: "8px 0 20px" }}>
              {[...editions, { id: "", name: "Modules only", tagline: "", custom: false, currency: baseCurrency, moduleIds: [] }].map((item) => {
                const chosen = group.editionId === item.id;
                return (
                  <button
                    key={item.id || "none"}
                    type="button"
                    role="radio"
                    aria-checked={chosen}
                    onClick={() => chooseEdition(item.id)}
                    style={{
                      all: "unset",
                      boxSizing: "border-box",
                      cursor: "pointer",
                      padding: "12px 14px",
                      background: chosen ? token.colorPrimaryBg : token.colorBgContainer,
                      boxShadow: chosen ? `inset 0 0 0 2px ${token.colorPrimary}` : undefined,
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                    }}
                  >
                    <Flex justify="space-between" align="center" gap={8}>
                      <Typography.Text strong>{item.name}</Typography.Text>
                      {chosen ? <CheckCircleFilled style={{ color: token.colorPrimary }} /> : null}
                    </Flex>
                    <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                      {!item.id
                        ? "Pick modules below"
                        : item.custom
                          ? "Pick any modules"
                          : `${formatMoney(editionTotal(item), item.currency)} · ${item.moduleIds.length} modules`}
                    </Typography.Text>
                  </button>
                );
              })}
            </div>

            <Flex justify="space-between" align="baseline">
              <Typography.Text type="secondary" style={sectionLabel}>
                Modules
              </Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {group.moduleIds.length} of {modules.length} ticked
              </Typography.Text>
            </Flex>
            <Flex vertical gap={12} style={{ marginTop: 8 }}>
              {categories.map(([category, items]) => {
                const ticked = items.filter((item) => group.moduleIds.includes(item.id)).length;
                return (
                  <div key={category} style={grid}>
                    <Flex
                      justify="space-between"
                      align="center"
                      style={{ gridColumn: "1 / -1", padding: "8px 14px", background: token.colorFillTertiary }}
                    >
                      <Typography.Text strong style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>
                        {category}
                      </Typography.Text>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {ticked} of {items.length}
                      </Typography.Text>
                    </Flex>
                    {items.map((item) => {
                      const checked = group.moduleIds.includes(item.id);
                      const inEdition = Boolean(edition?.moduleIds.includes(item.id));
                      const price = item.percent
                        ? `${item.percent}% of licence${item.recurring ? " / yr" : ""}`
                        : item.price === 0
                          ? "No charge"
                          : formatMoney(item.price, baseCurrency);
                      return (
                        // The checkbox is the whole cell (antd renders it as a label).
                        <Checkbox
                          key={item.id}
                          checked={checked}
                          onChange={(event) =>
                            update(group.key, {
                              moduleIds: event.target.checked ? [...group.moduleIds, item.id] : group.moduleIds.filter((id) => id !== item.id),
                            })
                          }
                          title={item.description || undefined}
                          style={{
                            margin: 0,
                            alignItems: "flex-start",
                            padding: "10px 14px",
                            background: checked ? token.colorPrimaryBg : token.colorBgContainer,
                            transition: "background 0.15s",
                          }}
                        >
                          <Flex vertical style={{ minWidth: 0 }}>
                            <Flex align="center" gap={6} wrap>
                              <Typography.Text strong={checked}>{item.name}</Typography.Text>
                              {inEdition ? (
                                <Tag bordered={false} color="orange" style={{ marginInlineEnd: 0, fontSize: 11, lineHeight: "16px", paddingInline: 5 }}>
                                  In edition
                                </Tag>
                              ) : null}
                            </Flex>
                            <Typography.Text type={checked ? undefined : "secondary"} style={{ fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
                              {price}
                            </Typography.Text>
                          </Flex>
                        </Checkbox>
                      );
                    })}
                  </div>
                );
              })}
            </Flex>
          </Card>
        );
      })}
      <Button type="dashed" icon={<PlusOutlined />} onClick={() => onChange([...groups, newGroup(editions, groups.length)])} block>
        Add another server group
      </Button>
    </Flex>
  );
}
