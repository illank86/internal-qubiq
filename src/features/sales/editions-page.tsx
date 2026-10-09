import { Fragment, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Button, Card, Checkbox, Col, Drawer, Flex, Form, Input, InputNumber, Popconfirm, Row, Segmented, Select, Space, Switch, Table, Tabs, Tag, Tooltip, Typography, theme } from "antd";
import type { TableColumnsType } from "antd";
import { CheckCircleFilled, DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { PageTitle } from "@/components/app-shell";
import type { Database } from "@/lib/database.types";
import { formatMoney } from "@/lib/invoices";
import { supabase } from "@/lib/supabase";
import { useAction } from "./use-action";
import { StatRow } from "./drawer-parts";

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
  const { token } = theme.useToken();
  const custom = Form.useWatch("custom", form) ?? edition?.allows_module_selection ?? false;
  const picked: string[] = Form.useWatch("module_ids", form) ?? edition?.modules.map((link) => link.module_id) ?? [];
  const currency = String(Form.useWatch("currency", form) ?? edition?.currency ?? "USD").toUpperCase() || "USD";
  const oneOff = data.modules.filter((module) => !module.percent_of_licence && !module.is_recurring);
  const categories = data.categories
    .map((category) => ({ category, modules: oneOff.filter((module) => module.category_id === category.id) }))
    .concat([{ category: { id: "", name: "Other" } as Category, modules: oneOff.filter((module) => !module.category_id) }])
    .filter((group) => group.modules.length > 0);
  const total = oneOff.filter((module) => picked.includes(module.id)).reduce((sum, module) => sum + Number(module.price), 0);
  const setPicked = (ids: string[]) => form.setFieldValue("module_ids", ids);
  const visible = Form.useWatch("is_visible", form) ?? edition?.is_visible ?? true;

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
      size={760}
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
        <Flex vertical gap={20}>
          <StatRow
            stats={[
              { label: "Price per server", value: custom ? "Customer's pick" : formatMoney(total, currency), strong: true },
              { label: "Modules", value: custom ? "Any" : picked.length },
              { label: "On the pricing page", value: visible ? "Visible" : "Hidden" },
            ]}
          />

          <FormSection title="Basics">
            <Row gutter={16}>
              <Col xs={24} sm={10}>
                <Form.Item label="Name" name="name" rules={[{ required: true, whitespace: true, max: 80 }]}>
                  <Input placeholder="Plant" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={9}>
                <Form.Item label="Slug" name="slug" rules={[{ required: true }, { pattern: SLUG, message: "Lowercase letters, numbers and dashes" }]}>
                  <Input />
                </Form.Item>
              </Col>
              <Col xs={24} sm={5}>
                <Form.Item label="Currency" name="currency" rules={[{ pattern: /^[A-Za-z]{3}$/, message: "e.g. USD" }]}>
                  <Input maxLength={3} style={{ textTransform: "uppercase" }} />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="custom" style={{ marginBottom: 0 }}>
              <ChoiceCards
                options={[
                  { value: false, title: "A fixed set of modules", description: "Tick the modules it includes; its price is their sum." },
                  { value: true, title: "Custom", description: "The customer picks any modules, each at its own price." },
                ]}
              />
            </Form.Item>
          </FormSection>

          {custom ? null : (
            <FormSection
              title="Modules in this edition"
              extra={
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {picked.length} ticked · {formatMoney(total, currency)}
                </Typography.Text>
              }
              description="On the pricing page these come with the edition; for anything else, customers choose Custom. Maintenance is offered on every edition, so it is not listed here."
            >
              {/* Holds the ticked modules; the table below sets it. */}
              <Form.Item name="module_ids" hidden>
                <Select mode="multiple" />
              </Form.Item>
              <Flex vertical gap={12}>
                {categories.map(({ category, modules }) => {
                  const ids = modules.map((module) => module.id);
                  const ticked = ids.filter((id) => picked.includes(id)).length;
                  return (
                    <div key={category.id || "other"} style={tableStyle(token)}>
                      <Flex align="center" justify="space-between" style={{ padding: "8px 14px", background: token.colorFillTertiary }}>
                        <Typography.Text strong style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>
                          {category.name}{" "}
                          <Typography.Text type="secondary" style={{ fontSize: 12, textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>
                            {ticked} of {ids.length}
                          </Typography.Text>
                        </Typography.Text>
                        <Space size={0}>
                          <Button type="link" size="small" onClick={() => setPicked([...new Set([...picked, ...ids])])}>
                            All
                          </Button>
                          <Button type="link" size="small" onClick={() => setPicked(picked.filter((id) => !ids.includes(id)))}>
                            None
                          </Button>
                        </Space>
                      </Flex>
                      <Flex align="center" justify="center" style={{ background: token.colorFillTertiary }}>
                        <Typography.Text type="secondary" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>
                          Include
                        </Typography.Text>
                      </Flex>
                      {modules.map((module) => {
                        const checked = picked.includes(module.id);
                        const toggle = (on: boolean) => setPicked(on ? [...picked, module.id] : picked.filter((id) => id !== module.id));
                        return (
                          <Fragment key={module.id}>
                            <div onClick={() => toggle(!checked)} style={{ background: token.colorBgContainer, padding: "10px 14px", cursor: "pointer", minWidth: 0 }}>
                              <Typography.Text>{module.name}</Typography.Text>
                              <div>
                                <Typography.Text type="secondary" style={{ fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
                                  {Number(module.price) === 0 ? "No charge" : formatMoney(module.price, module.currency)}
                                </Typography.Text>
                              </div>
                            </div>
                            <Flex align="center" justify="center" style={{ background: token.colorBgContainer }}>
                              <Checkbox checked={checked} onChange={(event) => toggle(event.target.checked)} aria-label={`Include ${module.name}`} />
                            </Flex>
                          </Fragment>
                        );
                      })}
                    </div>
                  );
                })}
              </Flex>
            </FormSection>
          )}

          <FormSection title="On the pricing page">
            <Form.Item label="Tagline" name="tagline" rules={[{ max: 200 }]} extra="One line under the name.">
              <Input placeholder="For a whole plant, every protocol" />
            </Form.Item>
            <Form.Item label="Description" name="description" rules={[{ max: 1000 }]}>
              <Input.TextArea rows={3} />
            </Form.Item>
            <Row gutter={16}>
              <Col xs={24} sm={14}>
                <Form.Item label="Badge" name="badge" rules={[{ max: 40 }]} extra="A short label on the card, e.g. Most popular.">
                  <Input placeholder="Most popular" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={10}>
                <Form.Item label="Order" name="sort_order" extra="Lower comes first.">
                  <InputNumber min={0} max={10000} style={{ width: "100%" }} />
                </Form.Item>
              </Col>
            </Row>
            <SwitchRow name="is_featured" title="Featured" description="Highlighted among the editions." />
            <SwitchRow name="is_visible" title="Visible" description="Shown on the pricing page and offered in quotations." last />
          </FormSection>
        </Flex>
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
        <ModuleDrawer module={editing === "new" ? null : editing} modules={data.modules} categories={data.categories} onClose={() => setEditing(null)} run={run} busy={busy} />
      ) : null}
    </>
  );
}

function ModuleDrawer({
  module,
  modules,
  categories,
  onClose,
  run,
  busy,
}: {
  module: Module | null;
  modules: Module[];
  categories: Category[];
  onClose: () => void;
  run: TabProps["run"];
  busy: string | null;
}) {
  const [form] = Form.useForm<ModuleValues & { pricing: "flat" | "percent" }>();
  const { token } = theme.useToken();
  const pricing = Form.useWatch("pricing", form) ?? (module?.percent_of_licence ? "percent" : "flat");
  const name = Form.useWatch("name", form) ?? module?.name ?? "";
  const price = Form.useWatch("price", form) ?? Number(module?.price ?? 0);
  const percent = Form.useWatch("percent_of_licence", form) ?? module?.percent_of_licence ?? null;
  const yearly = Form.useWatch("is_recurring", form) ?? module?.is_recurring ?? false;
  const currency = String(Form.useWatch("currency", form) ?? module?.currency ?? "USD").toUpperCase() || "USD";
  const priceText = pricing === "percent" ? `${Number(percent) || 0}% of licence${yearly ? " / yr" : ""}` : Number(price) === 0 ? "No charge" : `${formatMoney(Number(price) || 0, currency)}${yearly ? " / yr" : ""}`;

  const save = ({ pricing: mode, ...values }: ModuleValues & { pricing: "flat" | "percent" }) =>
    run(
      "module",
      async () => {
        const row = {
          ...values,
          currency: (values.currency || "USD").toUpperCase(),
          // One way of pricing: a flat fee, or a share of the licence.
          price: mode === "percent" ? 0 : Number(values.price) || 0,
          percent_of_licence: mode === "percent" ? values.percent_of_licence || null : null,
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
      size={680}
      destroyOnHidden
      extra={
        <Button type="primary" loading={busy === "module"} onClick={() => form.submit()}>
          Save module
        </Button>
      }
    >
      <Form<ModuleValues & { pricing: "flat" | "percent" }>
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
          pricing: module?.percent_of_licence ? "percent" : "flat",
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
        <Flex vertical gap={20}>
          {/* How it reads in the quotation builder and on the pricing page. */}
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>
              Preview
            </Typography.Text>
            <div style={{ ...tableStyle(token), marginTop: 6 }}>
              <div style={{ background: token.colorBgContainer, padding: "10px 14px", minWidth: 0 }}>
                <Typography.Text>{name || "Module name"}</Typography.Text>
                <div>
                  <Typography.Text type="secondary" style={{ fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
                    {priceText}
                  </Typography.Text>
                </div>
              </div>
              <Flex align="center" justify="center" style={{ background: token.colorBgContainer }}>
                <Checkbox checked aria-label="Preview" />
              </Flex>
            </div>
          </div>

          <FormSection title="Basics">
            <Row gutter={16}>
              <Col xs={24} sm={12}>
                <Form.Item label="Name" name="name" rules={[{ required: true, whitespace: true }]}>
                  <Input placeholder="Modbus TCP/RTU" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item label="Slug" name="slug" rules={[{ required: true }, { pattern: SLUG, message: "Lowercase letters, numbers and dashes" }]}>
                  <Input />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item label="Group" name="category_id">
                  <Select allowClear placeholder="Choose a group" options={categories.map((category) => ({ value: category.id, label: category.name }))} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item label="Icon" name="icon" extra="A Lucide icon name, as on the website.">
                  <Input placeholder="cable" />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item label="Description" name="description" extra="Shown under the name on the pricing page.">
              <Input.TextArea rows={2} />
            </Form.Item>
            <Form.Item label="Small print" name="note" style={{ marginBottom: 0 }}>
              <Input />
            </Form.Item>
          </FormSection>

          <FormSection title="Price">
            <Form.Item name="pricing" style={{ marginBottom: 16 }}>
              <Segmented
                block
                options={[
                  { value: "flat", label: "Flat fee per server" },
                  { value: "percent", label: "% of the licence" },
                ]}
              />
            </Form.Item>
            {pricing === "percent" ? (
              <Form.Item
                label="Share of the licence"
                name="percent_of_licence"
                rules={[{ required: true, message: "Enter a percentage" }]}
                extra="Worked out from the one-off licence total — how maintenance is priced."
              >
                <InputNumber min={0} max={100} suffix="%" style={{ width: "100%" }} />
              </Form.Item>
            ) : (
              <Row gutter={16}>
                <Col xs={16} sm={18}>
                  <Form.Item label="Price" name="price" extra="0 shows as “No charge”.">
                    <InputNumber min={0} style={{ width: "100%" }} />
                  </Form.Item>
                </Col>
                <Col xs={8} sm={6}>
                  <Form.Item label="Currency" name="currency">
                    <Input maxLength={3} style={{ textTransform: "uppercase" }} />
                  </Form.Item>
                </Col>
              </Row>
            )}
            <SwitchRow name="is_recurring" title="Billed every year" description="Kept out of the one-off licence total." last />
          </FormSection>

          <FormSection title="In the builder">
            <Form.Item label="Requires" name="requires" extra="Ticked automatically, and locked, while this module is ticked.">
              <Select
                mode="multiple"
                allowClear
                placeholder="No other modules needed"
                optionFilterProp="label"
                options={modules.filter((other) => other.id !== module?.id).map((other) => ({ value: other.slug, label: other.name }))}
              />
            </Form.Item>
            <Form.Item label="Order" name="sort_order" extra="Lower comes first in its group.">
              <InputNumber min={0} style={{ width: 160 }} />
            </Form.Item>
            <SwitchRow name="is_default" title="Preselected" description="Ticked in the builder whatever the edition." />
            <SwitchRow name="is_visible" title="Visible" description="Offered on the pricing page and in quotations." last />
          </FormSection>
        </Flex>
      </Form>
    </Drawer>
  );
}

// ---------------------------------------------------------------- form parts

/** A table of cells: module and price | checkbox, the rules drawn by 1px gaps. */
const tableStyle = (token: ReturnType<typeof theme.useToken>["token"]) =>
  ({
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 72px",
    gap: 1,
    background: token.colorBorderSecondary,
    border: `1px solid ${token.colorBorderSecondary}`,
    borderRadius: token.borderRadiusLG,
    overflow: "hidden",
  }) as const;

/** A titled part of a form, on a soft panel. */
function FormSection({ title, description, extra, children }: { title: string; description?: string; extra?: React.ReactNode; children: React.ReactNode }) {
  const { token } = theme.useToken();
  return (
    <section style={{ border: `1px solid ${token.colorBorderSecondary}`, borderRadius: token.borderRadiusLG, padding: "16px 18px 18px" }}>
      <Flex justify="space-between" align="center" gap={8} style={{ marginBottom: description ? 4 : 14 }}>
        <Typography.Text strong style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>
          {title}
        </Typography.Text>
        {extra}
      </Flex>
      {description ? (
        <Typography.Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 14 }}>
          {description}
        </Typography.Paragraph>
      ) : null}
      {children}
    </section>
  );
}

/** A setting as a line: what it does on the left, a switch on the right. */
function SwitchRow({ name, title, description, last = false }: { name: string; title: string; description: string; last?: boolean }) {
  const { token } = theme.useToken();
  return (
    <Flex justify="space-between" align="center" gap={16} style={{ padding: "10px 0", borderTop: `1px solid ${token.colorBorderSecondary}`, marginBottom: last ? -8 : 0 }}>
      <div>
        <Typography.Text>{title}</Typography.Text>
        <div>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            {description}
          </Typography.Text>
        </div>
      </div>
      <Form.Item name={name} valuePropName="checked" noStyle>
        <Switch />
      </Form.Item>
    </Flex>
  );
}

/** Two or more options as selectable cards (a form control: value / onChange). */
function ChoiceCards<T extends string | boolean>({
  value,
  onChange,
  options,
}: {
  value?: T;
  onChange?: (value: T) => void;
  options: { value: T; title: string; description: string }[];
}) {
  const { token } = theme.useToken();
  return (
    <div role="radiogroup" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
      {options.map((option) => {
        const chosen = value === option.value;
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={chosen}
            onClick={() => onChange?.(option.value)}
            style={{
              all: "unset",
              boxSizing: "border-box",
              cursor: "pointer",
              padding: "12px 14px",
              borderRadius: token.borderRadiusLG,
              background: chosen ? token.colorPrimaryBg : token.colorFillQuaternary,
              transition: "background 0.15s",
            }}
          >
            <Flex justify="space-between" align="center" gap={8}>
              <Typography.Text strong>{option.title}</Typography.Text>
              {chosen ? <CheckCircleFilled style={{ color: token.colorPrimary }} /> : null}
            </Flex>
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              {option.description}
            </Typography.Text>
          </button>
        );
      })}
    </div>
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
