import { useState } from "react";
import { AutoComplete, Button, Drawer, Dropdown, Flex, Select, Space, Tag, Tooltip, Typography, theme } from "antd";
import type { MenuProps } from "antd";
import { BlockOutlined, CheckOutlined, DeleteOutlined, DownOutlined, EnterOutlined, MoreOutlined, PlusOutlined, RightOutlined, SettingOutlined, TagOutlined, UnorderedListOutlined } from "@ant-design/icons";
import { useCan } from "@/auth/use-auth";
import { CURRENCIES, UNITS, newItem, newPart, type CustomItemDraft, type ItemCategory, type ItemPartDraft, type ItemPricing } from "@/lib/sales";
import { ItemCategoriesTab } from "./item-categories-tab";
import { LazyInput, LazyNumber, LazyTextArea } from "./lazy-input";

const PRICING_ICON: Record<ItemPricing, React.ReactNode> = {
  item: <TagOutlined />,
  breakdown: <UnorderedListOutlined />,
  lump_sum: <BlockOutlined />,
};

const PRICING: Record<ItemPricing, { label: string; hint: string }> = {
  item: { label: "Single price", hint: "One line: quantity × unit price." },
  breakdown: { label: "Itemised", hint: "A heading whose price is the total of its priced lines." },
  lump_sum: { label: "Lump sum", hint: "One price; its lines only list what it covers." },
};

/** Description | Qty | Unit | Unit price | Amount | ⋯ — narrower screens scroll sideways. */
const COLUMNS = "minmax(150px, 1fr) 64px 88px 196px 124px 28px";
const MIN_WIDTH = 690;

/** A section of a group's items: made from a category, named for this quotation. */
type Section = { key: string; category: ItemCategory | undefined; categoryId: string; name: string; rows: CustomItemDraft[] };

/**
 * Additional items in a server group — hardware, services, other software:
 * anything sold with QUBIQ that is not a module. They sit in sections: add a
 * section from a category ("Software"), rename it for this quotation if you
 * like ("SCADA software"), then add its items. Each item is priced in its own
 * currency (quoted in that currency it prints exactly as entered); its
 * quantity is for this server group.
 */
export function CustomItemsEditor({
  items,
  onChange,
  categories,
  currency,
  convert,
  money,
}: {
  items: CustomItemDraft[];
  onChange: (next: CustomItemDraft[]) => void;
  categories: ItemCategory[];
  /** New items start in the quotation currency. */
  currency: string;
  /** A price in its currency, in the quotation currency; null while a rate is missing. */
  convert: (price: number, from: string) => number | null;
  money: (amount: number) => string;
}) {
  const { token } = theme.useToken();
  const can = useCan();
  const [managing, setManaging] = useState(false);
  // Folded sections, by their first item (a stable key while the section is renamed).
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const active = categories.filter((category) => category.active);
  const update = (key: string, next: Partial<CustomItemDraft>) => onChange(items.map((item) => (item.key === key ? { ...item, ...next } : item)));
  const updatePart = (item: CustomItemDraft, key: string, next: Partial<ItemPartDraft>) =>
    update(item.key, { parts: item.parts.map((part) => (part.key === key ? { ...part, ...next } : part)) });
  const remove = (key: string) => onChange(items.filter((item) => item.key !== key));
  const currencyOptions = [...new Set([currency, ...CURRENCIES])].map((code) => ({ value: code, label: code }));
  const unitOptions = UNITS.map((unit) => ({ value: unit }));
  const muted = { fontSize: 12, color: token.colorTextSecondary };

  // Sections in category order, then in the order they were made (as they print).
  const sectionKey = (item: CustomItemDraft) => `${item.categoryId}|${item.section}`;
  const order = (id: string) => {
    const index = categories.findIndex((category) => category.id === id);
    return index < 0 ? categories.length : index;
  };
  const sections: Section[] = [];
  for (const item of items) {
    const found = sections.find((section) => section.key === sectionKey(item));
    if (found) found.rows.push(item);
    else
      sections.push({
        key: sectionKey(item),
        categoryId: item.categoryId,
        category: categories.find((category) => category.id === item.categoryId),
        name: item.section,
        rows: [item],
      });
  }
  sections.sort((a, b) => order(a.categoryId) - order(b.categoryId));

  /** A new section's name: the category's, numbered if this group already has one by that name. */
  const freshName = (category: ItemCategory) => {
    const taken = new Set(sections.filter((section) => section.categoryId === category.id).map((section) => section.name));
    if (!taken.has(category.name)) return category.name;
    let n = 2;
    while (taken.has(`${category.name} ${n}`)) n += 1;
    return `${category.name} ${n}`;
  };
  const rename = (section: Section, name: string) =>
    onChange(items.map((item) => (sectionKey(item) === section.key ? { ...item, section: name.trim() || section.category?.name || "Items" } : item)));

  /** An amount in the quotation currency — or that its rate is still needed. */
  const amount = (price: number, from: string, quantity: number) => {
    const unit = convert(price, from);
    if (unit === null) return <Typography.Text type="warning" style={{ fontSize: 12 }}>Needs {from} rate</Typography.Text>;
    return <Typography.Text style={{ fontVariantNumeric: "tabular-nums" }}>{money(unit * quantity)}</Typography.Text>;
  };
  const itemTotal = (item: CustomItemDraft) => {
    if (item.pricing !== "breakdown") {
      const unit = convert(item.price, item.currency);
      return unit === null ? null : unit * item.quantity;
    }
    let sum = 0;
    for (const part of item.parts) {
      const unit = convert(part.price, part.currency || item.currency);
      if (unit === null) return null;
      sum += unit * part.quantity;
    }
    return sum;
  };

  const priceInput = (price: number, code: string, onPrice: (value: number) => void, onCurrency: (value: string) => void, label: string, size?: "small") => (
    <Space.Compact style={{ width: "100%" }} size={size}>
      <Select value={code} onChange={onCurrency} options={currencyOptions} showSearch style={{ width: 74 }} aria-label={`Currency of ${label}`} />
      <LazyNumber
        min={0}
        value={price}
        onCommit={(next) => onPrice(Math.max(0, next))}
        style={{ width: "100%" }}
        formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
        parser={(value) => Number((value ?? "").replace(/,/g, ""))}
        aria-label={`Unit price of ${label}`}
      />
    </Space.Compact>
  );

  const unitInput = (value: string, onUnit: (unit: string) => void, label: string, size?: "small") => (
    <AutoComplete
      value={value}
      size={size}
      options={unitOptions}
      onChange={(next) => onUnit(String(next ?? "").slice(0, 20))}
      filterOption={(input, option) => (option?.value ?? "").startsWith(input.toLowerCase())}
      placeholder="ea"
      aria-label={`Unit of ${label}`}
    />
  );

  const setPricing = (item: CustomItemDraft, pricing: ItemPricing) => {
    // Itemised needs a line to price; start it with one.
    const parts = pricing === "breakdown" && item.parts.length === 0 ? [newPart(item.currency, item.unit || "ea")] : item.parts;
    update(item.key, { pricing, parts });
  };

  const menu = (item: CustomItemDraft): MenuProps => ({
    items: [
      {
        key: "pricing",
        type: "group",
        label: "Pricing",
        children: (Object.keys(PRICING) as ItemPricing[]).map((key) => ({
          key: `pricing:${key}`,
          icon: PRICING_ICON[key],
          label: (
            <Flex justify="space-between" gap={16} style={{ minWidth: 260 }}>
              <Flex vertical>
                <span style={{ fontWeight: item.pricing === key ? 600 : 400 }}>{PRICING[key].label}</span>
                <span style={muted}>{PRICING[key].hint}</span>
              </Flex>
              {item.pricing === key ? <CheckOutlined style={{ color: token.colorPrimary }} /> : null}
            </Flex>
          ),
        })),
      },
      { type: "divider" },
      {
        key: "move",
        label: "Move to section",
        children: sections.filter((section) => section.key !== sectionKey(item)).map((section) => ({ key: `move:${section.key}`, label: section.name })),
        disabled: sections.length < 2,
      },
      { key: "remove", label: "Remove item", danger: true, icon: <DeleteOutlined /> },
    ],
    onClick: ({ key }) => {
      if (key === "remove") return remove(item.key);
      if (key.startsWith("pricing:")) return setPricing(item, key.slice(8) as ItemPricing);
      if (key.startsWith("move:")) {
        const to = sections.find((section) => section.key === key.slice(5));
        return to ? update(item.key, { categoryId: to.categoryId, section: to.name }) : undefined;
      }
    },
  });

  const row = { display: "grid", gridTemplateColumns: COLUMNS, gap: 8, alignItems: "center" } as const;

  const itemRows = (item: CustomItemDraft) => {
    const label = item.description || "this item";
    const total = itemTotal(item);
    return (
      <div key={item.key} style={{ padding: "10px 12px", borderTop: `1px solid ${token.colorBorderSecondary}` }}>
        <div style={row}>
          <LazyInput
            value={item.description}
            maxLength={300}
            onCommit={(next) => update(item.key, { description: next })}
            placeholder="Item, e.g. Industrial PC"
            status={item.description.trim() ? undefined : "warning"}
            aria-label="Description"
          />
          {item.pricing === "breakdown" ? (
            <>
              <span />
              <span />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Total of the lines below ↓
              </Typography.Text>
            </>
          ) : (
            <>
              <LazyNumber
                min={0.01}
                max={9999999}
                value={item.quantity}
                onCommit={(next) => update(item.key, { quantity: Math.max(0.01, next || 1) })}
                style={{ width: "100%" }}
                aria-label={`Quantity of ${label}`}
              />
              {unitInput(item.unit, (unit) => update(item.key, { unit }), label)}
              {priceInput(item.price, item.currency, (price) => update(item.key, { price }), (code) => update(item.key, { currency: code }), label)}
            </>
          )}
          <Flex vertical align="flex-end" gap={2}>
            {total === null ? (
              <Typography.Text type="warning" style={{ fontSize: 12 }}>
                Needs a rate
              </Typography.Text>
            ) : (
              <Typography.Text strong style={{ fontVariantNumeric: "tabular-nums" }}>
                {money(total)}
              </Typography.Text>
            )}
          </Flex>
          <Dropdown menu={menu(item)} trigger={["click"]} placement="bottomRight">
            <Button type="text" icon={<MoreOutlined />} aria-label={`Options for ${label}`} />
          </Dropdown>
        </div>
        {/* Details, with how the item is priced pinned in its top-right corner as it grows. */}
        <div style={{ position: "relative", marginTop: 6 }}>
          <LazyTextArea
            value={item.detail}
            maxLength={1000}
            onCommit={(next) => update(item.key, { detail: next })}
            placeholder="Details (optional): model, specification, scope — printed under the item"
            autoSize={{ minRows: 1, maxRows: 6 }}
            style={{ color: token.colorTextSecondary, paddingRight: item.pricing === "item" ? undefined : 150 }}
            aria-label={`Details of ${label}`}
          />
          {item.pricing !== "item" ? (
            <Tooltip title={`${PRICING[item.pricing].hint} Change it from the ⋯ menu.`} placement="left">
              <Tag
                bordered={false}
                icon={PRICING_ICON[item.pricing]}
                color={item.pricing === "breakdown" ? "purple" : "cyan"}
                style={{ position: "absolute", top: 5, right: 6, marginInlineEnd: 0, fontSize: 11, lineHeight: "18px", paddingInline: 6, cursor: "help" }}
              >
                {item.pricing === "breakdown" ? `Itemised · ${item.parts.length} line${item.parts.length === 1 ? "" : "s"}` : `Lump sum · ${item.parts.length} line${item.parts.length === 1 ? "" : "s"}`}
              </Tag>
            </Tooltip>
          ) : null}
        </div>

        {item.pricing !== "item" ? (
          <div style={{ marginTop: 4 }}>
            {item.parts.map((part, at) => {
              const partLabel = part.description || `line ${at + 1}`;
              return (
                <div key={part.key} style={{ ...row, marginTop: 6 }}>
                  <Flex gap={6} align="center" style={{ minWidth: 0, paddingLeft: 12 }}>
                    <EnterOutlined style={{ transform: "scaleX(-1)", color: token.colorTextQuaternary }} />
                    <LazyInput
                      value={part.description}
                      maxLength={300}
                      onCommit={(next) => updatePart(item, part.key, { description: next })}
                      placeholder={item.pricing === "breakdown" ? "Line, e.g. Installation" : "Covers, e.g. Site survey"}
                      status={part.description.trim() ? undefined : "warning"}
                      size="small"
                      aria-label={`Line ${at + 1} of ${label}`}
                    />
                  </Flex>
                  <LazyNumber
                    min={0.01}
                    max={9999999}
                    size="small"
                    value={part.quantity}
                    onCommit={(next) => updatePart(item, part.key, { quantity: Math.max(0.01, next || 1) })}
                    style={{ width: "100%" }}
                    aria-label={`Quantity of ${partLabel}`}
                  />
                  {unitInput(part.unit, (unit) => updatePart(item, part.key, { unit }), partLabel, "small")}
                  {item.pricing === "breakdown" ? (
                    priceInput(
                      part.price,
                      part.currency || item.currency,
                      (price) => updatePart(item, part.key, { price }),
                      (code) => updatePart(item, part.key, { currency: code }),
                      partLabel,
                      "small",
                    )
                  ) : (
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      Included in the lump sum
                    </Typography.Text>
                  )}
                  <span style={{ textAlign: "right" }}>{item.pricing === "breakdown" ? amount(part.price, part.currency || item.currency, part.quantity) : null}</span>
                  <Button
                    type="text"
                    size="small"
                    icon={<DeleteOutlined />}
                    aria-label={`Remove ${partLabel}`}
                    disabled={item.pricing === "breakdown" && item.parts.length === 1}
                    onClick={() => update(item.key, { parts: item.parts.filter((entry) => entry.key !== part.key) })}
                  />
                </div>
              );
            })}
            <Button
              type="link"
              size="small"
              icon={<PlusOutlined />}
              style={{ marginLeft: 28, paddingInline: 0, marginTop: 4 }}
              disabled={item.parts.length >= 50}
              onClick={() => update(item.key, { parts: [...item.parts, newPart(item.currency, item.unit || "ea")] })}
            >
              {item.pricing === "breakdown" ? "Add priced line" : "Add what it covers"}
            </Button>
          </div>
        ) : null}
      </div>
    );
  };

  const table = (section: Section) => {
    const totals = section.rows.map(itemTotal);
    const sum = totals.every((value) => value !== null) ? totals.reduce<number>((acc, value) => acc + (value ?? 0), 0) : null;
    const category = section.category;
    const id = section.rows[0].key;
    const open = !folded.has(id);
    const fold = () =>
      setFolded((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    return (
      // Keyed by its first item, so renaming it (which changes section.key) keeps the field focused.
      <div key={section.rows[0].key} style={{ border: `1px solid ${token.colorBorderSecondary}`, borderRadius: token.borderRadiusLG, overflow: "hidden" }}>
        {/* The section: its name (editable here), what category it is, its total. */}
        <Flex align="center" gap={8} style={{ padding: "8px 12px", background: token.colorFillTertiary }}>
          <Button
            type="text"
            size="small"
            icon={open ? <DownOutlined /> : <RightOutlined />}
            onClick={fold}
            aria-expanded={open}
            aria-label={`${open ? "Collapse" : "Expand"} ${section.name}`}
          />
          <LazyInput
            value={section.name}
            maxLength={60}
            onCommit={(name) => rename(section, name)}
            required
            placeholder={section.category?.name ?? "Section name"}
            variant="borderless"
            style={{ fontWeight: 600, paddingInline: 4, maxWidth: 320, background: token.colorBgContainer }}
            aria-label="Section name"
          />
          {category && category.name !== section.name ? (
            <Tag bordered={false} style={{ marginInlineEnd: 0 }}>
              {category.name}
            </Tag>
          ) : null}
          {category && !category.active ? <Tag style={{ marginInlineEnd: 0 }}>Not offered</Tag> : null}
          {!open ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {section.rows.length} item{section.rows.length === 1 ? "" : "s"}
            </Typography.Text>
          ) : null}
          <Typography.Text strong style={{ marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>
            {sum === null ? "" : money(sum)}
          </Typography.Text>
          <Tooltip title="Remove the section and its items">
            <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => onChange(items.filter((item) => sectionKey(item) !== section.key))} aria-label={`Remove ${section.name}`} />
          </Tooltip>
        </Flex>
        {open ? (
        <>
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: MIN_WIDTH }}>
            <div style={{ ...row, padding: "6px 12px 0" }}>
              <span style={muted}>Description</span>
              <span style={muted}>Qty</span>
              <span style={muted}>Unit</span>
              <span style={muted}>Unit price</span>
              <span style={{ ...muted, textAlign: "right" }}>Amount</span>
              <span />
            </div>
            {section.rows.map(itemRows)}
          </div>
        </div>
        <div style={{ padding: "6px 12px", borderTop: `1px solid ${token.colorBorderSecondary}` }}>
          <Button
            type="link"
            size="small"
            icon={<PlusOutlined />}
            style={{ paddingInline: 0 }}
            disabled={items.length >= 100 || !category}
            onClick={() => category && onChange([...items, newItem(category, currency, section.name)])}
          >
            Add item
          </Button>
        </div>
        </>
        ) : null}
      </div>
    );
  };

  return (
    <div>
      <Flex justify="space-between" align="baseline" gap={12} wrap style={{ marginTop: 20 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>
          Additional items
        </Typography.Text>
        <Space size={12}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Hardware, services, other software for this group — each in its own currency
          </Typography.Text>
          {can("pricing.manage") ? (
            <Button type="link" size="small" icon={<SettingOutlined />} style={{ paddingInline: 0 }} onClick={() => setManaging(true)}>
              Categories
            </Button>
          ) : null}
        </Space>
      </Flex>
      <Flex vertical gap={10} style={{ marginTop: 8 }}>
        {sections.map(table)}
        <Flex gap={8} wrap align="center">
          {active.length > 0 ? (
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              Add a section:
            </Typography.Text>
          ) : null}
          {active.map((category) => (
            <Button key={category.id} type="dashed" icon={<PlusOutlined />} disabled={items.length >= 100} onClick={() => onChange([...items, newItem(category, currency, freshName(category))])}>
              {category.name}
            </Button>
          ))}
          {active.length === 0 ? (
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              No item categories yet{can("pricing.manage") ? " — add them under Categories." : "."}
            </Typography.Text>
          ) : null}
        </Flex>
      </Flex>
      <Drawer open={managing} onClose={() => setManaging(false)} title="Item categories" size={720} destroyOnHidden>
        <ItemCategoriesTab />
      </Drawer>
    </div>
  );
}
