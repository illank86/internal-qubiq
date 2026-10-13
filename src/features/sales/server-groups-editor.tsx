import { Button, Card, Checkbox, Flex, InputNumber, Space, Tag, Tooltip, Typography, theme } from "antd";
import { Fragment, useState } from "react";
import { CheckCircleFilled, CopyOutlined, DeleteOutlined, DownOutlined, PlusOutlined, RightOutlined, ShareAltOutlined } from "@ant-design/icons";
import { formatMoney } from "@/lib/invoices";
import { newGroup, newSharedGroup, type BuilderEdition, type BuilderModule, type GroupDraft, type ItemCategory } from "@/lib/sales";
import { CustomItemsEditor } from "./custom-items-editor";
import { LazyInput } from "./lazy-input";

/**
 * Server groups: one quotation can cover several servers, each group with its
 * own edition and modules and a number of identical servers. Choosing an
 * edition ticks its modules; anything added on top stays when it changes.
 * Below the modules, additional items: hardware, services, other software.
 * Project items (kind "shared") cover the whole project rather than one group: a block of their own, kept last.
 * Each block folds away to a one-line summary.
 */
export function ServerGroupsEditor({
  groups,
  onChange,
  editions,
  modules,
  subtotals,
  money,
  itemCategories,
  currency,
  convert,
}: {
  groups: GroupDraft[];
  onChange: (next: GroupDraft[]) => void;
  editions: BuilderEdition[];
  modules: BuilderModule[];
  subtotals: number[];
  money: (amount: number) => string;
  itemCategories: ItemCategory[];
  /** The quotation currency: new items start in it. */
  currency: string;
  /** A custom item's price in the quotation currency; null while a rate is missing. */
  convert: (price: number, from: string) => number | null;
}) {
  const categories = [...modules.reduce((map, item) => map.set(item.category, [...(map.get(item.category) ?? []), item]), new Map<string, BuilderModule[]>())];
  // An edition costs what its modules cost.
  const editionTotal = (edition: BuilderEdition) =>
    modules.filter((item) => edition.moduleIds.includes(item.id) && !item.percent).reduce((sum, item) => sum + item.price, 0);
  const update = (key: string, next: Partial<GroupDraft>) => onChange(groups.map((group) => (group.key === key ? { ...group, ...next } : group)));
  const { token } = theme.useToken();
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setFolded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const serverGroups = groups.filter((group) => group.kind !== "shared");
  const shared = groups.find((group) => group.kind === "shared");
  // Project items stay last: a new server group goes before them.
  const addServerGroup = (group: GroupDraft) => onChange([...serverGroups, group, ...(shared ? [shared] : [])]);
  const foldButton = (key: string, label: string) => (
    <Button
      type="text"
      size="small"
      icon={folded.has(key) ? <RightOutlined /> : <DownOutlined />}
      onClick={() => toggle(key)}
      aria-expanded={!folded.has(key)}
      aria-label={`${folded.has(key) ? "Expand" : "Collapse"} ${label}`}
    />
  );
  /** "3 modules · 2 additional items" — what a folded block holds. */
  const itemsText = (count: number) => (count ? `${count} additional item${count === 1 ? "" : "s"}` : "no additional items");
  const sectionLabel = { fontSize: 12, textTransform: "uppercase", letterSpacing: 1 } as const;
  // A table per category — module and price | checkbox. The 1px gaps over a
  // border-coloured background draw the rules.
  const grid = {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 72px",
    gap: 1,
    background: token.colorBorderSecondary,
    border: `1px solid ${token.colorBorderSecondary}`,
    borderRadius: token.borderRadiusLG,
    overflow: "hidden",
  } as const;

  return (
    <Flex vertical gap={16}>
      {groups.map((group, index) => {
        const subtotal = money(subtotals[index] ?? 0);
        const open = !folded.has(group.key);
        if (group.kind === "shared") {
          return (
            <Card
              key={group.key}
              size="small"
              style={{ borderStyle: "dashed" }}
              title={
                <Flex align="center" gap={8} wrap>
                  {foldButton(group.key, group.label || "project items")}
                  <ShareAltOutlined style={{ color: token.colorPrimary }} />
                  <LazyInput
                    value={group.label}
                    maxLength={120}
                    onCommit={(label) => update(group.key, { label })}
                    placeholder="Project items"
                    aria-label="Name of the project items"
                    variant="filled"
                    style={{ fontWeight: 600, maxWidth: 300 }}
                  />
                </Flex>
              }
              extra={
                <Space size={4}>
                  <Typography.Text strong style={{ minWidth: 110, textAlign: "right", display: "inline-block" }}>
                    {subtotal}
                  </Typography.Text>
                  <Tooltip title="Remove project items">
                    <Button type="text" danger icon={<DeleteOutlined />} onClick={() => onChange(groups.filter((item) => item.key !== group.key))} />
                  </Tooltip>
                </Space>
              }
            >
              {open ? (
                <>
                  <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                    Items for the whole project — project management, commissioning, network equipment, training. Printed after the groups with its own
                    subtotal; no maintenance is charged on it.
                  </Typography.Text>
                  <CustomItemsEditor
                    items={group.items}
                    onChange={(items) => update(group.key, { items })}
                    categories={itemCategories}
                    currency={currency}
                    convert={convert}
                    money={money}
                  />
                </>
              ) : (
                <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                  {itemsText(group.items.length)}
                </Typography.Text>
              )}
            </Card>
          );
        }
        const number = serverGroups.indexOf(group) + 1;
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
                {foldButton(group.key, group.label || `server group ${number}`)}
                <Typography.Text type="secondary">{number}.</Typography.Text>
                <LazyInput
                  value={group.label}
                  maxLength={120}
                  onCommit={(label) => update(group.key, { label })}
                  placeholder={`Server group ${number}`}
                  aria-label={`Name of server group ${number}`}
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
                  {subtotal}
                </Typography.Text>
                <Tooltip title="Duplicate group">
                  <Button
                    type="text"
                    icon={<CopyOutlined />}
                    onClick={() =>
                      onChange([...groups.slice(0, index + 1), newGroup(editions, serverGroups.length, { ...group, label: `${group.label} (copy)` }), ...groups.slice(index + 1)])
                    }
                  />
                </Tooltip>
                {serverGroups.length > 1 ? (
                  <Tooltip title="Remove group">
                    <Button type="text" danger icon={<DeleteOutlined />} onClick={() => onChange(groups.filter((item) => item.key !== group.key))} />
                  </Tooltip>
                ) : null}
              </Space>
            }
          >
            {!open ? (
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                {[edition?.name ? `${edition.name} edition` : null, `${group.moduleIds.length} module${group.moduleIds.length === 1 ? "" : "s"}`, itemsText(group.items.length)]
                  .filter(Boolean)
                  .join(" · ")}
              </Typography.Text>
            ) : (
            <>
            <Typography.Text type="secondary" style={sectionLabel}>
              Edition
            </Typography.Text>
            <div
              role="radiogroup"
              aria-label="Edition"
              style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8, margin: "8px 0 20px" }}
            >
              {/* Every group starts from an edition; Custom is the one with modules picked freely. */}
              {editions.map((item) => {
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
                      borderRadius: token.borderRadiusLG,
                      background: chosen ? token.colorPrimaryBg : token.colorFillQuaternary,
                      transition: "background 0.15s",
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
                      {item.custom
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
                    <Flex align="center" gap={8} style={{ padding: "8px 14px", background: token.colorFillTertiary }}>
                      <Typography.Text strong style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>
                        {category}
                      </Typography.Text>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {ticked} of {items.length}
                      </Typography.Text>
                    </Flex>
                    <Flex align="center" justify="center" style={{ background: token.colorFillTertiary }}>
                      <Typography.Text type="secondary" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>
                        Include
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
                      const toggle = (on: boolean) =>
                        update(group.key, { moduleIds: on ? [...group.moduleIds, item.id] : group.moduleIds.filter((id) => id !== item.id) });
                      // Only the checkbox shows a module is ticked; the chosen edition is the one tinted.
                      const cell = { background: token.colorBgContainer };
                      return (
                        <Fragment key={item.id}>
                          {/* Column 1: the module and its price; clicking it ticks the box too. */}
                          <div
                            onClick={() => toggle(!checked)}
                            title={item.description || undefined}
                            style={{ ...cell, padding: "10px 14px", cursor: "pointer", minWidth: 0 }}
                          >
                            <Flex align="center" gap={6} wrap>
                              <Typography.Text>{item.name}</Typography.Text>
                              {inEdition ? (
                                <Tag bordered={false} color="orange" style={{ marginInlineEnd: 0, fontSize: 11, lineHeight: "16px", paddingInline: 5 }}>
                                  In edition
                                </Tag>
                              ) : null}
                            </Flex>
                            <Typography.Text type="secondary" style={{ fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
                              {price}
                            </Typography.Text>
                          </div>
                          {/* Column 2: the checkbox. */}
                          <Flex align="center" justify="center" style={cell}>
                            <Checkbox checked={checked} onChange={(event) => toggle(event.target.checked)} aria-label={`Include ${item.name}`} />
                          </Flex>
                        </Fragment>
                      );
                    })}
                  </div>
                );
              })}
            </Flex>

            <CustomItemsEditor
              items={group.items}
              onChange={(items) => update(group.key, { items })}
              categories={itemCategories}
              currency={currency}
              convert={convert}
              money={money}
            />
            </>
            )}
          </Card>
        );
      })}
      <Flex gap={8} wrap>
        <Button type="dashed" icon={<PlusOutlined />} onClick={() => addServerGroup(newGroup(editions, serverGroups.length))} style={{ flex: "1 1 220px" }}>
          Add another server group
        </Button>
        {!shared ? (
          <Tooltip title="Items for the whole project: project management, commissioning, network equipment.">
            <Button type="dashed" icon={<ShareAltOutlined />} onClick={() => onChange([...groups, newSharedGroup()])} style={{ flex: "1 1 220px" }}>
              Add project items
            </Button>
          </Tooltip>
        ) : null}
      </Flex>
    </Flex>
  );
}
