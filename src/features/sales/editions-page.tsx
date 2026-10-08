import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Card, Checkbox, Col, Drawer, Flex, Form, Input, InputNumber, Popconfirm, Row, Select, Space, Switch, Table, Tabs, Tag, Tooltip, Typography } from "antd";
import type { TableColumnsType } from "antd";
import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { PageTitle } from "@/components/app-shell";
import type { Database } from "@/lib/database.types";
import { formatMoney } from "@/lib/invoices";
import { supabase } from "@/lib/supabase";
import { useAction } from "./use-action";

type Edition = Database["public"]["Tables"]["license_editions"]["Row"] & { modules: { module_id: string }[] };
type Module = Database["public"]["Tables"]["license_modules"]["Row"];
type Category = Database["public"]["Tables"]["license_module_categories"]["Row"];

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const fail = (error: { code?: string; message?: string } | null) => {
  if (error) throw error;
};

/**
 * The price list: modules (grouped), and editions — a set of modules plus a
 * platform base price. Choosing an edition ticks its modules everywhere: the
 * pricing page, quotations and invoices.
 */
export function EditionsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "editions";
  const { run, busy } = useAction([["price-list"], ["sales-catalog"]]);

  const { data, isLoading } = useQuery({
    queryKey: ["price-list"],
    queryFn: async () => {
      const [editions, modules, categories, blocks] = await Promise.all([
        supabase.from("license_editions").select("*, modules:license_edition_modules(module_id)").order("sort_order"),
        supabase.from("license_modules").select("*").order("sort_order"),
        supabase.from("license_module_categories").select("*").order("sort_order"),
        supabase.from("page_sections").select("id, settings").eq("section_key", "license-builder"),
      ]);
      fail(editions.error ?? modules.error ?? categories.error);
      return {
        editions: (editions.data ?? []) as unknown as Edition[],
        modules: modules.data ?? [],
        categories: categories.data ?? [],
        blocks: blocks.data ?? [],
      };
    },
  });

  const pricesShown = (data?.blocks[0]?.settings as { showPrices?: boolean } | null)?.showPrices !== false;

  /** The licence builder block's showPrices: editions and modules show either way. */
  const setPricesShown = (show: boolean) =>
    run("prices", async () => {
      for (const block of data?.blocks ?? []) {
        const settings = { ...((block.settings as Record<string, unknown> | null) ?? {}), showPrices: show };
        const { error } = await supabase.from("page_sections").update({ settings }).eq("id", block.id);
        fail(error);
      }
    }, show ? "Prices are shown on the pricing page." : "Prices are hidden on the pricing page.");

  return (
    <>
      <PageTitle
        title="Editions & modules"
        description="Every module and its price, and the editions built from them. Changes show on the pricing page straight away."
        actions={
          <Tooltip title="Editions and modules show either way; without prices, visitors choose and ask for a quote.">
            <Space>
              <Typography.Text>Prices on the pricing page</Typography.Text>
              <Switch checked={pricesShown} loading={busy === "prices"} disabled={!data || data.blocks.length === 0} onChange={setPricesShown} />
            </Space>
          </Tooltip>
        }
      />
      <Card>
        <Tabs
          activeKey={tab}
          onChange={(key) => setParams({ tab: key }, { replace: true })}
          items={[
            { key: "editions", label: `Editions${data ? ` (${data.editions.length})` : ""}`, children: <EditionsTab data={data} loading={isLoading} run={run} busy={busy} /> },
            { key: "modules", label: `Modules${data ? ` (${data.modules.length})` : ""}`, children: <ModulesTab data={data} loading={isLoading} run={run} busy={busy} /> },
            { key: "groups", label: "Module groups", children: <GroupsTab data={data} loading={isLoading} run={run} busy={busy} /> },
          ]}
        />
      </Card>
    </>
  );
}

type TabProps = {
  data: { editions: Edition[]; modules: Module[]; categories: Category[] } | undefined;
  loading: boolean;
  run: ReturnType<typeof useAction>["run"];
  busy: string | null;
};

// ------------------------------------------------------------------ editions

type EditionValues = {
  name: string;
  slug: string;
  currency: string;
  custom: boolean;
  module_ids: string[];
  tagline: string;
  description: string;
  badge: string;
  is_featured: boolean;
  is_visible: boolean;
  sort_order: number | null;
};

function EditionsTab({ data, loading, run, busy }: TabProps) {
  const [editing, setEditing] = useState<Edition | "new" | null>(null);
  const moduleById = useMemo(() => new Map((data?.modules ?? []).map((module) => [module.id, module])), [data]);

  // An edition has no price of its own: it costs what its modules cost.
  const total = (edition: Edition) =>
    edition.modules.reduce((sum, link) => {
      const module = moduleById.get(link.module_id);
      return sum + (module && !module.percent_of_licence ? Number(module.price) : 0);
    }, 0);

  const columns: TableColumnsType<Edition> = [
    {
      title: "Edition",
      key: "name",
      render: (_, edition) => (
        <Flex vertical>
          <Space size={6}>
            <Typography.Text strong>{edition.name}</Typography.Text>
            {edition.badge ? <Tag color="orange">{edition.badge}</Tag> : null}
            {edition.is_featured ? <Tag>Featured</Tag> : null}
          </Space>
          {edition.tagline ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {edition.tagline}
            </Typography.Text>
          ) : null}
        </Flex>
      ),
    },
    { title: "Modules", key: "modules", render: (_, edition) => (edition.allows_module_selection ? <Tag>Customer picks</Tag> : edition.modules.length) },
    {
      title: "Total",
      key: "total",
      align: "right",
      render: (_, edition) =>
        edition.allows_module_selection ? (
          <Typography.Text type="secondary">Sum of the modules picked</Typography.Text>
        ) : (
          <Typography.Text strong>{formatMoney(total(edition), edition.currency)}</Typography.Text>
        ),
    },
    { title: "Visible", dataIndex: "is_visible", render: (value: boolean) => (value ? <Tag color="success">Visible</Tag> : <Tag>Hidden</Tag>) },
    {
      title: <span className="sr-only">Actions</span>,
      key: "actions",
      align: "right",
      render: (_, edition) => (
        <Space size={4}>
          <Button size="small" type="text" icon={<EditOutlined />} onClick={() => setEditing(edition)} aria-label={`Edit ${edition.name}`} />
          <Popconfirm
            title={`Delete ${edition.name}?`}
            description="Quotations and invoices already made keep their lines."
            okText="Delete"
            okButtonProps={{ danger: true }}
            onConfirm={() => run(`del:${edition.id}`, async () => fail((await supabase.from("license_editions").delete().eq("id", edition.id)).error), "Edition deleted.")}
          >
            <Button size="small" type="text" danger icon={<DeleteOutlined />} loading={busy === `del:${edition.id}`} aria-label={`Delete ${edition.name}`} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Flex justify="flex-end" style={{ marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing("new")}>
          New edition
        </Button>
      </Flex>
      <Table<Edition> rowKey="id" loading={loading} columns={columns} dataSource={data?.editions ?? []} pagination={false} scroll={{ x: 760 }} />
      {editing && data ? <EditionDrawer edition={editing === "new" ? null : editing} data={data} onClose={() => setEditing(null)} run={run} busy={busy} /> : null}
    </>
  );
}

function EditionDrawer({ edition, data, onClose, run, busy }: { edition: Edition | null; data: NonNullable<TabProps["data"]>; onClose: () => void; run: TabProps["run"]; busy: string | null }) {
  const [form] = Form.useForm<EditionValues>();
  const custom = Form.useWatch("custom", form);
  const picked = Form.useWatch("module_ids", form) ?? [];
  const currency = Form.useWatch("currency", form) ?? "USD";
  const oneOff = data.modules.filter((module) => !module.percent_of_licence && !module.is_recurring);
  const categories = data.categories
    .map((category) => ({ category, modules: oneOff.filter((module) => module.category_id === category.id) }))
    .concat([{ category: { id: "", name: "Other" } as Category, modules: oneOff.filter((module) => !module.category_id) }])
    .filter((group) => group.modules.length > 0);
  const total = custom ? 0 : oneOff.filter((module) => picked.includes(module.id)).reduce((sum, module) => sum + Number(module.price), 0);

  const save = (values: EditionValues) =>
    run(
      "edition",
      async () => {
        const { error } = await supabase.rpc("save_license_edition", {
          p_edition_id: edition?.id as string,
          p_name: values.name.trim(),
          p_slug: values.slug.trim(),
          // Editions have no price of their own (the database insists on 0).
          p_base_price: 0,
          p_currency: (values.currency || "USD").toUpperCase(),
          p_module_ids: values.custom ? [] : values.module_ids,
          p_custom: values.custom,
          p_tagline: values.tagline?.trim() || undefined,
          p_description: values.description?.trim() || undefined,
          p_badge: values.badge?.trim() || undefined,
          p_is_featured: values.is_featured,
          p_is_visible: values.is_visible,
          p_sort_order: values.sort_order ?? undefined,
        });
        fail(error);
      },
      "Edition saved. The pricing page shows it now.",
    ).then((ok) => ok && onClose());

  return (
    <Drawer
      open
      onClose={onClose}
      title={edition ? `Edit ${edition.name}` : "New edition"}
      size={640}
      destroyOnHidden
      extra={
        <Button type="primary" loading={busy === "edition"} onClick={() => form.submit()}>
          Save edition
        </Button>
      }
    >
      <Form<EditionValues>
        form={form}
        layout="vertical"
        requiredMark="optional"
        onFinish={save}
        initialValues={{
          name: edition?.name ?? "",
          slug: edition?.slug ?? "",
          currency: edition?.currency ?? "USD",
          custom: edition?.allows_module_selection ?? false,
          module_ids: edition?.modules.map((link) => link.module_id) ?? [],
          tagline: edition?.tagline ?? "",
          description: edition?.description ?? "",
          badge: edition?.badge ?? "",
          is_featured: edition?.is_featured ?? false,
          is_visible: edition?.is_visible ?? true,
          sort_order: edition?.sort_order ?? null,
        }}
        onValuesChange={(changed) => {
          if (!edition && "name" in changed) form.setFieldValue("slug", slugify(String(changed.name)));
        }}
      >
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item label="Name" name="name" rules={[{ required: true, whitespace: true, max: 80 }]}>
              <Input placeholder="Pro" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item label="Slug" name="slug" rules={[{ required: true }, { pattern: SLUG, message: "Lowercase letters, numbers and dashes" }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item label="Currency" name="currency" rules={[{ pattern: /^[A-Za-z]{3}$/, message: "e.g. USD" }]}>
              <Input maxLength={3} style={{ textTransform: "uppercase" }} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="custom" valuePropName="checked">
          <Checkbox>Custom — the customer picks the modules</Checkbox>
        </Form.Item>
        {custom ? null : (
          <Form.Item label={`Modules in this edition (${picked.length})`} name="module_ids">
            <Checkbox.Group style={{ width: "100%", display: "block" }}>
              {categories.map(({ category, modules }) => (
                <div key={category.id || "other"} style={{ marginBottom: 12 }}>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {category.name}
                  </Typography.Text>
                  <Row gutter={[8, 4]} style={{ marginTop: 4 }}>
                    {modules.map((module) => (
                      <Col key={module.id} xs={24} sm={12}>
                        <Checkbox value={module.id}>
                          {module.name}{" "}
                          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            {formatMoney(module.price, module.currency)}
                          </Typography.Text>
                        </Checkbox>
                      </Col>
                    ))}
                  </Row>
                </div>
              ))}
            </Checkbox.Group>
          </Form.Item>
        )}
        <Alert
          type="info"
          showIcon
          title={custom ? "Priced by the modules the customer picks" : `Total ${formatMoney(total, String(currency).toUpperCase() || "USD")}`}
          description={
            custom
              ? "On the pricing page, Custom is the only edition where modules can be chosen."
              : "An edition has no price of its own: it is the sum of the modules ticked. On the pricing page these modules come with it and nothing else can be added — for other modules, customers choose Custom. Maintenance is offered on every edition."
          }
          style={{ marginBottom: 16 }}
        />
        <Form.Item label="Tagline" name="tagline" rules={[{ max: 200 }]}>
          <Input />
        </Form.Item>
        <Form.Item label="Description" name="description" rules={[{ max: 1000 }]}>
          <Input.TextArea rows={3} />
        </Form.Item>
        <Row gutter={16}>
          <Col xs={24} sm={8}>
            <Form.Item label="Badge" name="badge" rules={[{ max: 40 }]}>
              <Input placeholder="Most popular" />
            </Form.Item>
          </Col>
          <Col xs={12} sm={8}>
            <Form.Item label="Order" name="sort_order">
              <InputNumber min={0} max={10000} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col xs={12} sm={8}>
            <Form.Item label=" " name="is_featured" valuePropName="checked">
              <Checkbox>Featured</Checkbox>
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="is_visible" valuePropName="checked">
          <Checkbox>Visible on the pricing page</Checkbox>
        </Form.Item>
      </Form>
    </Drawer>
  );
}

// ------------------------------------------------------------------- modules

type ModuleValues = Pick<Module, "name" | "slug" | "category_id" | "icon" | "description" | "note" | "price" | "currency" | "percent_of_licence" | "is_recurring" | "is_default" | "requires" | "is_visible" | "sort_order">;

function ModulesTab({ data, loading, run, busy }: TabProps) {
  const [editing, setEditing] = useState<Module | "new" | null>(null);
  const [search, setSearch] = useState("");
  const categoryName = useMemo(() => new Map((data?.categories ?? []).map((category) => [category.id, category.name])), [data]);
  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const order = new Map((data?.categories ?? []).map((category, index) => [category.id, index]));
    return [...(data?.modules ?? [])]
      .filter((module) => !query || `${module.name} ${module.slug}`.toLowerCase().includes(query))
      .sort((a, b) => (order.get(a.category_id ?? "") ?? 999) - (order.get(b.category_id ?? "") ?? 999) || a.sort_order - b.sort_order);
  }, [data, search]);

  const columns: TableColumnsType<Module> = [
    {
      title: "Module",
      key: "name",
      render: (_, module) => (
        <Flex vertical>
          <Typography.Text strong>{module.name}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {module.slug}
          </Typography.Text>
        </Flex>
      ),
    },
    { title: "Group", key: "group", render: (_, module) => categoryName.get(module.category_id ?? "") ?? "—" },
    {
      title: "Price",
      key: "price",
      align: "right",
      render: (_, module) => (module.percent_of_licence ? `${module.percent_of_licence}% of licence${module.is_recurring ? " / yr" : ""}` : formatMoney(module.price, module.currency)),
    },
    {
      title: "Flags",
      key: "flags",
      render: (_, module) => (
        <Space size={4} wrap>
          {module.is_default ? <Tag>Preselected</Tag> : null}
          {module.is_recurring ? <Tag>Yearly</Tag> : null}
          {!module.is_visible ? <Tag>Hidden</Tag> : null}
        </Space>
      ),
    },
    {
      title: <span className="sr-only">Actions</span>,
      key: "actions",
      align: "right",
      render: (_, module) => (
        <Space size={4}>
          <Button size="small" type="text" icon={<EditOutlined />} onClick={() => setEditing(module)} aria-label={`Edit ${module.name}`} />
          <Popconfirm
            title={`Delete ${module.name}?`}
            description="It leaves every edition. Quotations and invoices already made keep their lines."
            okText="Delete"
            okButtonProps={{ danger: true }}
            onConfirm={() => run(`del:${module.id}`, async () => fail((await supabase.from("license_modules").delete().eq("id", module.id)).error), "Module deleted.")}
          >
            <Button size="small" type="text" danger icon={<DeleteOutlined />} loading={busy === `del:${module.id}`} aria-label={`Delete ${module.name}`} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Flex justify="space-between" gap={12} wrap style={{ marginBottom: 12 }}>
        <Input.Search allowClear placeholder="Search modules" onChange={(event) => setSearch(event.target.value)} style={{ maxWidth: 300 }} />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing("new")}>
          New module
        </Button>
      </Flex>
      <Table<Module> rowKey="id" size="small" loading={loading} columns={columns} dataSource={rows} pagination={{ pageSize: 50, hideOnSinglePage: true }} scroll={{ x: 760 }} />
      {editing && data ? (
        <ModuleDrawer module={editing === "new" ? null : editing} categories={data.categories} onClose={() => setEditing(null)} run={run} busy={busy} />
      ) : null}
    </>
  );
}

function ModuleDrawer({ module, categories, onClose, run, busy }: { module: Module | null; categories: Category[]; onClose: () => void; run: TabProps["run"]; busy: string | null }) {
  const [form] = Form.useForm<ModuleValues>();
  const save = (values: ModuleValues) =>
    run(
      "module",
      async () => {
        const row = {
          ...values,
          currency: (values.currency || "USD").toUpperCase(),
          percent_of_licence: values.percent_of_licence || null,
          category_id: values.category_id || null,
          requires: values.requires ?? [],
        };
        const { error } = module ? await supabase.from("license_modules").update(row).eq("id", module.id) : await supabase.from("license_modules").insert(row);
        fail(error);
      },
      "Module saved.",
    ).then((ok) => ok && onClose());

  return (
    <Drawer
      open
      onClose={onClose}
      title={module ? `Edit ${module.name}` : "New module"}
      size={560}
      destroyOnHidden
      extra={
        <Button type="primary" loading={busy === "module"} onClick={() => form.submit()}>
          Save module
        </Button>
      }
    >
      <Form<ModuleValues>
        form={form}
        layout="vertical"
        requiredMark="optional"
        onFinish={save}
        initialValues={{
          name: module?.name ?? "",
          slug: module?.slug ?? "",
          category_id: module?.category_id ?? null,
          icon: module?.icon ?? null,
          description: module?.description ?? null,
          note: module?.note ?? null,
          price: Number(module?.price ?? 0),
          currency: module?.currency ?? "USD",
          percent_of_licence: module?.percent_of_licence ?? null,
          is_recurring: module?.is_recurring ?? false,
          is_default: module?.is_default ?? false,
          requires: module?.requires ?? [],
          is_visible: module?.is_visible ?? true,
          sort_order: module?.sort_order ?? 0,
        }}
        onValuesChange={(changed) => {
          if (!module && "name" in changed) form.setFieldValue("slug", slugify(String(changed.name)));
        }}
      >
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item label="Name" name="name" rules={[{ required: true, whitespace: true }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item label="Slug" name="slug" rules={[{ required: true }, { pattern: SLUG, message: "Lowercase letters, numbers and dashes" }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item label="Group" name="category_id">
              <Select allowClear options={categories.map((category) => ({ value: category.id, label: category.name }))} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item label="Icon" name="icon" extra="A Lucide icon name, as on the website.">
              <Input />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item label="Description" name="description">
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item label="Small print" name="note">
          <Input />
        </Form.Item>
        <Row gutter={16}>
          <Col xs={12} sm={8}>
            <Form.Item label="Price" name="price">
              <InputNumber min={0} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col xs={12} sm={6}>
            <Form.Item label="Currency" name="currency">
              <Input maxLength={3} style={{ textTransform: "uppercase" }} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={10}>
            <Form.Item label="Or a % of the licence" name="percent_of_licence" extra="How maintenance is priced. Blank for a flat fee.">
              <InputNumber min={0} max={100} suffix="%" style={{ width: "100%" }} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="is_recurring" valuePropName="checked" style={{ marginBottom: 4 }}>
          <Checkbox>Billed every year (kept out of the one-off total)</Checkbox>
        </Form.Item>
        <Form.Item name="is_default" valuePropName="checked">
          <Checkbox>Preselected in the builder, whatever the edition</Checkbox>
        </Form.Item>
        <Form.Item label="Requires modules" name="requires" extra="Ticked automatically and locked while this is selected.">
          <Select mode="tags" tokenSeparators={[",", " "]} placeholder="Module slugs" />
        </Form.Item>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label="Order" name="sort_order">
              <InputNumber min={0} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label=" " name="is_visible" valuePropName="checked">
              <Checkbox>Visible</Checkbox>
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Drawer>
  );
}

// -------------------------------------------------------------- module groups

type GroupValues = Pick<Category, "name" | "slug" | "description" | "icon" | "is_visible" | "sort_order">;

function GroupsTab({ data, loading, run, busy }: TabProps) {
  const [editing, setEditing] = useState<Category | "new" | null>(null);
  const [form] = Form.useForm<GroupValues>();
  const target = editing === "new" ? null : editing;

  const columns: TableColumnsType<Category> = [
    { title: "Group", dataIndex: "name", render: (name: string) => <Typography.Text strong>{name}</Typography.Text> },
    { title: "Slug", dataIndex: "slug" },
    { title: "Modules", key: "count", render: (_, category) => (data?.modules ?? []).filter((module) => module.category_id === category.id).length },
    { title: "Order", dataIndex: "sort_order" },
    { title: "Visible", dataIndex: "is_visible", render: (value: boolean) => (value ? <Tag color="success">Visible</Tag> : <Tag>Hidden</Tag>) },
    {
      title: <span className="sr-only">Actions</span>,
      key: "actions",
      align: "right",
      render: (_, category) => (
        <Space size={4}>
          <Button size="small" type="text" icon={<EditOutlined />} onClick={() => setEditing(category)} aria-label={`Edit ${category.name}`} />
          <Popconfirm
            title={`Delete ${category.name}?`}
            description="Its modules stay, without a group."
            okText="Delete"
            okButtonProps={{ danger: true }}
            onConfirm={() => run(`del:${category.id}`, async () => fail((await supabase.from("license_module_categories").delete().eq("id", category.id)).error), "Group deleted.")}
          >
            <Button size="small" type="text" danger icon={<DeleteOutlined />} loading={busy === `del:${category.id}`} aria-label={`Delete ${category.name}`} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Flex justify="flex-end" style={{ marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing("new")}>
          New group
        </Button>
      </Flex>
      <Table<Category> rowKey="id" size="small" loading={loading} columns={columns} dataSource={data?.categories ?? []} pagination={false} />
      <Drawer
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={target ? `Edit ${target.name}` : "New group"}
        size={480}
        destroyOnHidden
        extra={
          <Button type="primary" loading={busy === "group"} onClick={() => form.submit()}>
            Save group
          </Button>
        }
      >
        {editing !== null ? (
          <Form<GroupValues>
            form={form}
            layout="vertical"
            requiredMark="optional"
            initialValues={{ name: target?.name ?? "", slug: target?.slug ?? "", description: target?.description ?? null, icon: target?.icon ?? null, is_visible: target?.is_visible ?? true, sort_order: target?.sort_order ?? 0 }}
            onValuesChange={(changed) => {
              if (!target && "name" in changed) form.setFieldValue("slug", slugify(String(changed.name)));
            }}
            onFinish={(values) =>
              run(
                "group",
                async () => {
                  const { error } = target ? await supabase.from("license_module_categories").update(values).eq("id", target.id) : await supabase.from("license_module_categories").insert(values);
                  fail(error);
                },
                "Group saved.",
              ).then((ok) => ok && setEditing(null))
            }
          >
            <Form.Item label="Name" name="name" rules={[{ required: true, whitespace: true }]}>
              <Input />
            </Form.Item>
            <Form.Item label="Slug" name="slug" rules={[{ required: true }, { pattern: SLUG, message: "Lowercase letters, numbers and dashes" }]}>
              <Input />
            </Form.Item>
            <Form.Item label="Description" name="description">
              <Input />
            </Form.Item>
            <Form.Item label="Icon" name="icon">
              <Input />
            </Form.Item>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item label="Order" name="sort_order">
                  <InputNumber min={0} style={{ width: "100%" }} />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item label=" " name="is_visible" valuePropName="checked">
                  <Checkbox>Visible</Checkbox>
                </Form.Item>
              </Col>
            </Row>
          </Form>
        ) : null}
      </Drawer>
    </>
  );
}
