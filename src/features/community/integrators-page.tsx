import { useMemo, useState } from "react";
import { RichTextField } from "@/features/content/rich-text-field";
import { useQuery } from "@tanstack/react-query";
import { Avatar, Button, Checkbox, Col, Drawer, Flex, Form, Input, InputNumber, Row, Segmented, Select, Table, Tabs, Tag, Typography } from "antd";
import type { TableColumnsType } from "antd";
import { CheckOutlined, EnvironmentOutlined } from "@ant-design/icons";
import { useStaff } from "@/auth/use-auth";
import { PageTitle } from "@/components/app-shell";
import type { Database } from "@/lib/database.types";
import { env } from "@/lib/env";
import { formatInvoiceDate } from "@/lib/invoices";
import { supabase } from "@/lib/supabase";
import { useAction } from "@/features/sales/use-action";

type Integrator = Database["public"]["Tables"]["integrators"]["Row"];
type Status = Database["public"]["Enums"]["integrator_status"];
type Tier = Database["public"]["Enums"]["integrator_tier"];

const STATUSES: Status[] = ["pending", "approved", "rejected", "suspended"];
const TIERS: Tier[] = ["registered", "certified", "premier"];
const STATUS_COLOR: Record<Status, string> = { pending: "processing", approved: "success", rejected: "default", suspended: "error" };
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/**
 * The partner directory. Applications come from signed-in accounts, arrive
 * as pending and stay invisible until approved; approving emails the
 * applicant (a database trigger), and the directory refreshes by itself.
 */
export function IntegratorsPage() {
  const [filter, setFilter] = useState<Status | "all">("pending");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Integrator | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["integrators"],
    queryFn: async () => {
      const { data: rows, error } = await supabase.from("integrators").select("*").order("created_at", { ascending: false }).limit(1000);
      if (error) throw error;
      return rows ?? [];
    },
  });

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data ?? []).filter(
      (row) => (filter === "all" || row.status === filter) && (!query || [row.company_name, row.country, row.contact_email].some((value) => (value ?? "").toLowerCase().includes(query))),
    );
  }, [data, filter, search]);
  const pending = (data ?? []).filter((row) => row.status === "pending").length;

  const columns: TableColumnsType<Integrator> = [
    {
      title: "Company",
      key: "company",
      render: (_, row) => (
        <Flex gap={10} align="center">
          <Avatar shape="square" src={row.logo_url ?? undefined}>
            {row.company_name[0]}
          </Avatar>
          <Flex vertical>
            <Typography.Text strong>{row.company_name}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {row.contact_email}
            </Typography.Text>
          </Flex>
        </Flex>
      ),
    },
    { title: "Country", key: "country", render: (_, row) => [row.city, row.country].filter(Boolean).join(", "), responsive: ["md"] },
    { title: "Tier", dataIndex: "tier", render: (value: Tier) => <Tag>{value}</Tag> },
    { title: "Status", dataIndex: "status", render: (value: Status, row) => <Flex gap={4}><Tag color={STATUS_COLOR[value]}>{value}</Tag>{row.is_featured ? <Tag color="orange">Featured</Tag> : null}</Flex> },
    { title: "Applied", dataIndex: "created_at", render: (value: string) => formatInvoiceDate(value), responsive: ["md"] },
  ];

  return (
    <>
      <PageTitle title="Integrators" description="The partner directory. Applications arrive as pending and stay invisible until approved." />
      <Flex wrap gap={12} justify="space-between" style={{ marginBottom: 16 }}>
        <Segmented<Status | "all">
          value={filter}
          onChange={setFilter}
          options={[{ value: "pending", label: `Pending (${pending})` }, { value: "approved", label: "Approved" }, { value: "rejected", label: "Rejected" }, { value: "suspended", label: "Suspended" }, { value: "all", label: "All" }]}
        />
        <Input.Search allowClear placeholder="Search company, country or email" onChange={(event) => setSearch(event.target.value)} style={{ maxWidth: 320 }} />
      </Flex>
      <Table<Integrator>
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={rows}
        onRow={(record) => ({ onClick: () => setOpen(record), style: { cursor: "pointer" } })}
        pagination={{ pageSize: 25, hideOnSinglePage: true, showSizeChanger: false }}
        scroll={{ x: 720 }}
        locale={{ emptyText: filter === "pending" ? "No applications waiting." : "None here." }}
      />
      {open ? <IntegratorDrawer integrator={open} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

type Values = Omit<Integrator, "id" | "created_at" | "updated_at" | "owner_id" | "reviewed_at" | "reviewed_by">;

function IntegratorDrawer({ integrator, onClose }: { integrator: Integrator; onClose: () => void }) {
  const staff = useStaff();
  const [form] = Form.useForm<Values>();
  const { run, busy } = useAction([["integrators"]]);
  const latitude = Form.useWatch("latitude", form);
  const longitude = Form.useWatch("longitude", form);

  const save = (values: Values, approve = false) =>
    run(
      "save",
      async () => {
        const status = approve ? "approved" : values.status;
        if (status === "approved" && !values.slug) throw { code: "22023", message: "Add a slug before approving: it is the listing's web address." };
        const statusChanged = status !== integrator.status;
        const { error } = await supabase
          .from("integrators")
          .update({
            ...values,
            status,
            slug: values.slug || null,
            ...(statusChanged ? { reviewed_at: new Date().toISOString(), reviewed_by: staff.id } : {}),
          })
          .eq("id", integrator.id);
        if (error) throw error;
      },
      approve ? "Approved. The applicant has been emailed, and the listing is live." : "Saved.",
    ).then((ok) => ok && onClose());

  const tags = (name: keyof Values, labelText: string) => (
    <Form.Item label={labelText} name={name}>
      <Select mode="tags" tokenSeparators={[","]} placeholder="Type and press Enter" />
    </Form.Item>
  );

  return (
    <Drawer
      open
      onClose={onClose}
      title={integrator.company_name}
      size={760}
      destroyOnHidden
      extra={
        <Flex gap={8}>
          {integrator.status === "approved" && integrator.slug ? (
            <Button href={`${env.siteUrl}/integrators/${integrator.slug}`} target="_blank" rel="noreferrer">
              View listing
            </Button>
          ) : null}
          {integrator.status === "pending" ? (
            <Button type="primary" icon={<CheckOutlined />} loading={busy === "save"} onClick={() => form.validateFields().then((values) => save(values, true))}>
              Approve
            </Button>
          ) : null}
          <Button type={integrator.status === "pending" ? "default" : "primary"} loading={busy === "save"} onClick={() => form.submit()}>
            Save
          </Button>
        </Flex>
      }
    >
      <Form<Values>
        form={form}
        layout="vertical"
        requiredMark="optional"
        onFinish={(values) => save(values)}
        initialValues={integrator}
        onValuesChange={(changed) => {
          if ("company_name" in changed && !integrator.slug && !form.isFieldTouched("slug")) form.setFieldValue("slug", slugify(String(changed.company_name)));
        }}
      >
        <Tabs
          items={[
            {
              key: "profile",
              label: "Profile",
              forceRender: true,
              children: (
                <>
                  <Row gutter={16}>
                    <Col xs={24} sm={12}>
                      <Form.Item label="Company name" name="company_name" rules={[{ required: true, whitespace: true }]}>
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item label="Slug" name="slug" extra="Required before the listing can be approved." rules={[{ pattern: SLUG, message: "Lowercase letters, numbers and dashes" }]}>
                        <Input />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Form.Item label="One-line summary" name="summary">
                    <Input.TextArea rows={2} />
                  </Form.Item>
                  <Form.Item label="Profile" name="description">
                    <RichTextField rows={8} />
                  </Form.Item>
                  <Form.Item label="Logo URL" name="logo_url">
                    <Input />
                  </Form.Item>
                  <Row gutter={16}>
                    <Col xs={24} sm={8}>
                      <Form.Item label="Team size" name="team_size">
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col xs={12} sm={8}>
                      <Form.Item label="Founded" name="founded_year">
                        <InputNumber min={1900} max={2100} style={{ width: "100%" }} />
                      </Form.Item>
                    </Col>
                    <Col xs={12} sm={8}>
                      <Form.Item label="Projects delivered" name="project_count">
                        <InputNumber min={0} style={{ width: "100%" }} />
                      </Form.Item>
                    </Col>
                  </Row>
                </>
              ),
            },
            {
              key: "capabilities",
              label: "Capabilities",
              forceRender: true,
              children: (
                <>
                  {tags("services", "Services")}
                  {tags("industries", "Industries")}
                  {tags("protocols", "Protocols")}
                  {tags("languages", "Languages")}
                  {tags("certifications", "Certifications")}
                </>
              ),
            },
            {
              key: "contact",
              label: "Contact & location",
              forceRender: true,
              children: (
                <>
                  <Row gutter={16}>
                    <Col xs={24} sm={12}>
                      <Form.Item label="Contact name" name="contact_name">
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item label="Contact email" name="contact_email" rules={[{ required: true, type: "email" }]}>
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item label="Phone" name="contact_phone">
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item label="Website" name="website" rules={[{ type: "url", message: "A full address, https://…" }]}>
                        <Input />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Form.Item label="Address" name="address_line">
                    <Input />
                  </Form.Item>
                  <Row gutter={16}>
                    <Col xs={24} sm={12}>
                      <Form.Item label="City" name="city">
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item label="State / province" name="region">
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item label="Country" name="country" rules={[{ required: true }]}>
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item label="Postcode" name="postal_code">
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col xs={12} sm={8}>
                      <Form.Item label="Latitude" name="latitude" extra="The pin on the directory map.">
                        <InputNumber min={-90} max={90} step={0.0001} style={{ width: "100%" }} />
                      </Form.Item>
                    </Col>
                    <Col xs={12} sm={8}>
                      <Form.Item label="Longitude" name="longitude">
                        <InputNumber min={-180} max={180} step={0.0001} style={{ width: "100%" }} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={8}>
                      <Form.Item label=" ">
                        <Button
                          icon={<EnvironmentOutlined />}
                          disabled={latitude == null || longitude == null}
                          href={`https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=15/${latitude}/${longitude}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Check on a map
                        </Button>
                      </Form.Item>
                    </Col>
                  </Row>
                </>
              ),
            },
            {
              key: "review",
              label: "Review",
              forceRender: true,
              children: (
                <>
                  <Row gutter={16}>
                    <Col xs={24} sm={12}>
                      <Form.Item label="Status" name="status" extra="Approving emails the applicant.">
                        <Select options={STATUSES.map((value) => ({ value, label: value }))} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item label="Tier" name="tier">
                        <Select options={TIERS.map((value) => ({ value, label: value }))} />
                      </Form.Item>
                    </Col>
                  </Row>
                  <Form.Item name="is_featured" valuePropName="checked">
                    <Checkbox>Feature in the directory</Checkbox>
                  </Form.Item>
                  <Form.Item label="Internal notes" name="internal_notes">
                    <Input.TextArea rows={3} />
                  </Form.Item>
                  <Form.Item label="SEO title" name="seo_title" extra="The browser tab and search result for the listing. Empty for the default.">
                    <Input />
                  </Form.Item>
                  <Form.Item label="SEO description" name="seo_description">
                    <Input.TextArea rows={2} />
                  </Form.Item>
                </>
              ),
            },
          ]}
        />
      </Form>
    </Drawer>
  );
}
