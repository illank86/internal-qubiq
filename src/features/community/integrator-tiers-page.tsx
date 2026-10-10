import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Flex, Form, Input, InputNumber, Modal, Popconfirm, Table, Typography } from "antd";
import type { TableColumnsType } from "antd";
import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { PageTitle } from "@/components/app-shell";
import type { Database } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";
import { useAction } from "@/features/sales/use-action";

type Tier = Database["public"]["Tables"]["integrator_tiers"]["Row"] & { count: number };
type Values = { name: string; slug: string; description: string; sort_order: number };

const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

/** The integrator tiers: loaded with their partner discount and how many integrators are on each. */
export function useIntegratorTiers() {
  return useQuery({
    queryKey: ["integrator-tiers"],
    queryFn: async () => {
      const [{ data: tiers, error }, { data: integrators }] = await Promise.all([
        supabase.from("integrator_tiers").select("*").order("sort_order").order("name"),
        supabase.from("integrators").select("tier"),
      ]);
      if (error) throw error;
      const counts = new Map<string, number>();
      for (const row of integrators ?? []) counts.set(row.tier, (counts.get(row.tier) ?? 0) + 1);
      return (tiers ?? []).map((tier) => ({ ...tier, count: counts.get(tier.slug) ?? 0 })) as Tier[];
    },
  });
}

/**
 * Integrator tiers: the levels an integrator is placed on. Add as many as
 * needed. The partner discount per tier is a sales decision, set in Sales
 * settings (TierDiscounts).
 */
export function IntegratorTiersPage() {
  const { data, isLoading, error } = useIntegratorTiers();
  const { run, busy } = useAction([["integrator-tiers"], ["integrators"], ["integrators-approved"]]);
  const [editing, setEditing] = useState<Tier | "new" | null>(null);

  const columns: TableColumnsType<Tier> = [
    {
      title: "Tier",
      key: "name",
      render: (_, row) => (
        <Flex vertical>
          <Typography.Text strong>{row.name}</Typography.Text>
          {row.description ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {row.description}
            </Typography.Text>
          ) : null}
        </Flex>
      ),
    },
    { title: "Integrators", dataIndex: "count", align: "right", width: 110 },
    {
      title: <span className="sr-only">Actions</span>,
      key: "actions",
      align: "right",
      width: 110,
      render: (_, row) => (
        <Flex gap={4} justify="flex-end">
          <Button size="small" type="text" icon={<EditOutlined />} aria-label={`Edit ${row.name}`} onClick={() => setEditing(row)} />
          <Popconfirm
            title={`Delete the ${row.name} tier?`}
            description={row.count ? "Move its integrators to another tier first." : "Quotations already priced keep their discount."}
            okText="Delete"
            okButtonProps={{ danger: true, disabled: row.count > 0 }}
            onConfirm={() =>
              run(`delete:${row.slug}`, async () => {
                const { error: deleteError } = await supabase.from("integrator_tiers").delete().eq("slug", row.slug);
                if (deleteError) throw deleteError;
              }, "Tier deleted.")
            }
          >
            <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label={`Delete ${row.name}`} loading={busy === `delete:${row.slug}`} />
          </Popconfirm>
        </Flex>
      ),
    },
  ];

  return (
    <>
      <PageTitle
        title="Integrator tiers"
        description="The levels integrators are placed on. Each tier's partner discount is set in Sales settings → Quotations."
        actions={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing("new")}>
            Add tier
          </Button>
        }
      />
      {error ? <Alert type="error" showIcon title="The tiers could not be loaded." style={{ marginBottom: 16 }} /> : null}
      <Table<Tier> rowKey="slug" loading={isLoading} columns={columns} dataSource={data ?? []} pagination={false} />
      <TierModal key={editing === "new" ? "new" : (editing?.slug ?? "closed")} tier={editing} onClose={() => setEditing(null)} run={run} />
    </>
  );
}

function TierModal({ tier, onClose, run }: { tier: Tier | "new" | null; onClose: () => void; run: ReturnType<typeof useAction>["run"] }) {
  const [form] = Form.useForm<Values>();
  const [pending, setPending] = useState(false);
  const isNew = tier === "new";
  const existing = tier && tier !== "new" ? tier : null;

  const save = async (values: Values) => {
    setPending(true);
    const row = {
      name: values.name.trim(),
      description: values.description?.trim() || null,
      sort_order: Number(values.sort_order) || 0,
    };
    const ok = await run(
      "tier",
      async () => {
        const { error } = existing
          ? await supabase.from("integrator_tiers").update(row).eq("slug", existing.slug)
          : await supabase.from("integrator_tiers").insert({ ...row, slug: values.slug || slugify(values.name) });
        if (error) throw error.code === "23505" ? { code: "22023", message: "A tier with that key already exists." } : error;
      },
      existing ? "Tier saved." : "Tier added.",
    );
    setPending(false);
    if (ok) onClose();
  };

  return (
    <Modal
      open={Boolean(tier)}
      onCancel={onClose}
      title={isNew ? "Add tier" : `Edit ${existing?.name ?? "tier"}`}
      okText={isNew ? "Add tier" : "Save"}
      okButtonProps={{ loading: pending }}
      onOk={() => form.submit()}
      destroyOnHidden
    >
      <Form<Values>
        form={form}
        layout="vertical"
        requiredMark="optional"
        onFinish={save}
        disabled={pending}
        initialValues={{
          name: existing?.name ?? "",
          slug: existing?.slug ?? "",
          description: existing?.description ?? "",
          sort_order: existing?.sort_order ?? 0,
        }}
        onValuesChange={(changed) => {
          if (isNew && "name" in changed) form.setFieldValue("slug", slugify(changed.name ?? ""));
        }}
      >
        <Form.Item label="Name" name="name" rules={[{ required: true, whitespace: true, message: "Name the tier" }, { max: 60 }]}>
          <Input placeholder="e.g. Gold partner" />
        </Form.Item>
        {isNew ? (
          <Form.Item label="Key" name="slug" extra="Fixed once added. Lowercase letters, numbers and dashes." rules={[{ required: true, pattern: /^[a-z0-9][a-z0-9_-]{0,39}$/, message: "Lowercase letters, numbers and dashes" }]}>
            <Input />
          </Form.Item>
        ) : null}
        <Form.Item label="Description" name="description" rules={[{ max: 300 }]}>
          <Input.TextArea rows={2} placeholder="What it takes to reach this tier" />
        </Form.Item>
        <Form.Item label="Order" name="sort_order" extra="Lower numbers first.">
          <InputNumber style={{ width: 120 }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
