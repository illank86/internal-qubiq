import { Button, Card, Checkbox, Col, Flex, Input, InputNumber, Radio, Row, Space, Tooltip, Typography } from "antd";
import { CopyOutlined, DeleteOutlined, PlusOutlined } from "@ant-design/icons";
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
            <Typography.Text type="secondary" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>
              Edition
            </Typography.Text>
            <Radio.Group value={group.editionId} onChange={(event) => chooseEdition(event.target.value)} style={{ width: "100%", margin: "8px 0 16px" }}>
              <Row gutter={[8, 8]}>
                {[...editions, { id: "", name: "No edition — modules only", tagline: "", custom: false, currency: baseCurrency, moduleIds: [] }].map((item) => (
                  <Col key={item.id || "none"} xs={24} sm={12} xl={8}>
                    <Radio value={item.id}>
                      {item.name}
                      {item.id ? (
                        <Typography.Text type="secondary" style={{ marginLeft: 6, fontSize: 12 }}>
                          {formatMoney(editionTotal(item), item.currency)}
                        </Typography.Text>
                      ) : null}
                    </Radio>
                  </Col>
                ))}
              </Row>
            </Radio.Group>

            <Typography.Text type="secondary" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>
              Modules · {group.moduleIds.length} ticked
            </Typography.Text>
            <Checkbox.Group value={group.moduleIds} onChange={(values) => update(group.key, { moduleIds: values as string[] })} style={{ width: "100%", display: "block", marginTop: 8 }}>
              {categories.map(([category, items]) => (
                <div key={category} style={{ marginBottom: 12 }}>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {category}
                  </Typography.Text>
                  <Row gutter={[8, 4]} style={{ marginTop: 4 }}>
                    {items.map((item) => (
                      <Col key={item.id} xs={24} md={12}>
                        <Checkbox value={item.id}>
                          {item.name}
                          <Typography.Text type="secondary" style={{ marginLeft: 6, fontSize: 12 }}>
                            {item.percent ? `${item.percent}% of licence${item.recurring ? "/yr" : ""}` : formatMoney(item.price, baseCurrency)}
                          </Typography.Text>
                        </Checkbox>
                      </Col>
                    ))}
                  </Row>
                </div>
              ))}
            </Checkbox.Group>
          </Card>
        );
      })}
      <Button type="dashed" icon={<PlusOutlined />} onClick={() => onChange([...groups, newGroup(editions, groups.length)])} block>
        Add another server group
      </Button>
    </Flex>
  );
}
