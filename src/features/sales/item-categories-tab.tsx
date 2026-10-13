import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AutoComplete, Button, Checkbox, Col, Drawer, Flex, Form, Input, InputNumber, Popconfirm, Row, Space, Table, Tag, Typography } from "antd";
import type { TableColumnsType } from "antd";
import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import type { Database } from "@/lib/database.types";
import { UNITS } from "@/lib/sales";
import { supabase } from "@/lib/supabase";
import { useAction } from "./use-action";

type ItemCategoryRow = Database["public"]["Tables"]["quotation_item_categories"]["Row"];
type Values = { name: string; slug: string; default_unit: string; sort_order: number | null; in_licence_base: boolean; is_active: boolean };

const SLUG = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

/**
 * Categories of the additional items quotations can carry besides modules:
 * Software, Hardware, Services, … Quotations and invoices keep the name they
 * were made with, so renaming one never changes a sent document. One in use
 * cannot be deleted; switch it off instead.
 */
export function ItemCategoriesTab() {
  const { run, busy } = useAction([["item-categories"], ["sales-catalog"]]);
  const [editing, setEditing] = useState<ItemCategoryRow | "new" | null>(null);
  const [form] = Form.useForm<Values>();
  const target = editing === "new" ? null : editing;

  const { data, isLoading } = useQuery({
    queryKey: ["item-categories"],
    queryFn: async () => {
      const { data: rows, error } = await supabase.from("quotation_item_categories").select("*").order("sort_order").order("name");
      if (error) throw error;
      return rows ?? [];
    },
  });

  const remove = (category: ItemCategoryRow) =>
    run(
      `del:${category.id}`,
      async () => {
        const { error } = await supabase.from("quotation_item_categories").delete().eq("id", category.id);
        // Referenced by a quotation or invoice line.
        if (error?.code === "23503") throw { code: "22023", message: `${category.name} is used on quotations or invoices. Switch it off instead.` };
        if (error) throw error;
      },
      "Category deleted.",
    );

  const columns: TableColumnsType<ItemCategoryRow> = [
    { title: "Category", dataIndex: "name", render: (name: string) => <Typography.Text strong>{name}</Typography.Text> },
    { title: "Default unit", dataIndex: "default_unit" },
    {
      title: "Maintenance",
      dataIndex: "in_licence_base",
      render: (value: boolean) => (value ? <Tag color="blue">Charged on it</Tag> : <Typography.Text type="secondary">—</Typography.Text>),
    },
    { title: "Order", dataIndex: "sort_order" },
    { title: "In quotations", dataIndex: "is_active", render: (value: boolean) => (value ? <Tag color="success">Offered</Tag> : <Tag>Off</Tag>) },
    {
      title: <span className="sr-only">Actions</span>,
      key: "actions",
      align: "right",
      render: (_, category) => (
        <Space size={4}>
          <Button size="small" type="text" icon={<EditOutlined />} onClick={() => setEditing(category)} aria-label={`Edit ${category.name}`} />
          <Popconfirm
            title={`Delete ${category.name}?`}
            description="Only while no quotation or invoice uses it."
            okText="Delete"
            okButtonProps={{ danger: true }}
            onConfirm={() => remove(category)}
          >
            <Button size="small" type="text" danger icon={<DeleteOutlined />} loading={busy === `del:${category.id}`} aria-label={`Delete ${category.name}`} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Flex justify="space-between" align="center" gap={12} wrap style={{ marginBottom: 12 }}>
        <Typography.Text type="secondary">
          What quotations can carry besides modules — hardware, services, other software. Each item is priced on the quotation itself.
        </Typography.Text>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing("new")}>
          New category
        </Button>
      </Flex>
      <Table<ItemCategoryRow> rowKey="id" size="small" loading={isLoading} columns={columns} dataSource={data ?? []} pagination={false} />
      <Drawer
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={target ? `Edit ${target.name}` : "New category"}
        size={480}
        destroyOnHidden
        extra={
          <Button type="primary" loading={busy === "category"} onClick={() => form.submit()}>
            Save category
          </Button>
        }
      >
        {editing !== null ? (
          <Form<Values>
            form={form}
            layout="vertical"
            requiredMark="optional"
            initialValues={{
              name: target?.name ?? "",
              slug: target?.slug ?? "",
              default_unit: target?.default_unit ?? "ea",
              sort_order: target?.sort_order ?? ((data ?? []).reduce((max, row) => Math.max(max, row.sort_order), 0) + 10),
              in_licence_base: target?.in_licence_base ?? false,
              is_active: target?.is_active ?? true,
            }}
            onValuesChange={(changed) => {
              if (!target && "name" in changed) form.setFieldValue("slug", slugify(String(changed.name)));
            }}
            onFinish={(values) =>
              run(
                "category",
                async () => {
                  const row = { ...values, name: values.name.trim(), default_unit: values.default_unit.trim() || "ea", sort_order: values.sort_order ?? 0 };
                  const { error } = target
                    ? await supabase.from("quotation_item_categories").update(row).eq("id", target.id)
                    : await supabase.from("quotation_item_categories").insert(row);
                  if (error?.code === "23505") throw { code: "22023", message: "That slug is taken by another category." };
                  if (error) throw error;
                },
                "Category saved.",
              ).then((ok) => ok && setEditing(null))
            }
          >
            <Form.Item
              label="Name"
              name="name"
              rules={[{ required: true, whitespace: true }, { max: 60 }]}
              extra="Printed as a heading over its items. Renaming changes new and re-saved quotations; documents already sent keep the old name."
            >
              <Input placeholder="e.g. Installation" />
            </Form.Item>
            <Form.Item label="Slug" name="slug" rules={[{ required: true }, { pattern: SLUG, message: "Lowercase letters, numbers, dashes; up to 40" }]}>
              <Input disabled={Boolean(target)} />
            </Form.Item>
            <Form.Item label="Default unit" name="default_unit" rules={[{ required: true, whitespace: true }, { max: 20 }]} extra="New items in this category start with it, e.g. pcs for hardware, lot for services. Each item can change it.">
              <AutoComplete options={UNITS.map((unit) => ({ value: unit }))} />
            </Form.Item>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item label="Order" name="sort_order" extra="Lower comes first.">
                  <InputNumber min={0} style={{ width: "100%" }} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label=" " name="is_active" valuePropName="checked">
                  <Checkbox>Offered in quotations</Checkbox>
                </Form.Item>
              </Col>
            </Row>
            <Form.Item
              name="in_licence_base"
              valuePropName="checked"
              extra="Percentage modules such as maintenance are charged on these items too, as on the QUBIQ licence. Usually only Software."
            >
              <Checkbox>Counts with the licence for maintenance</Checkbox>
            </Form.Item>
          </Form>
        ) : null}
      </Drawer>
    </>
  );
}
