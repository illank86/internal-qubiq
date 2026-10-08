import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, App, Avatar, Button, Card, Collapse, Flex, Form, Input, Modal, Popconfirm, Radio, Segmented, Select, Switch, Table, Tag, Tooltip, Typography } from "antd";
import type { TableColumnsType } from "antd";
import { UserAddOutlined } from "@ant-design/icons";
import { useStaff } from "@/auth/use-auth";
import { PageTitle } from "@/components/app-shell";
import { formatInvoiceDate } from "@/lib/invoices";
import { supabase } from "@/lib/supabase";
import type { AppRole, Profile } from "@/lib/types";
import { useAction } from "@/features/sales/use-action";

const ROLES: AppRole[] = ["admin", "sales", "editor", "licensing", "viewer"];
const ROLE_HINT: Record<AppRole, string> = {
  admin: "Everything, including users and roles",
  sales: "Quotations, and the inbox: leads, quote requests, bug reports, newsletters",
  editor: "Website content, blog, pricing, downloads and the inbox",
  licensing: "Licences, invoices and Sales settings",
  viewer: "Can sign in and look around",
};
type User = Profile & { roles: AppRole[]; approver: boolean };

/**
 * Everyone with an account: the team (staff, with roles) and customers.
 * Staff are invited; customers register on the website. A role on a customer
 * account grants nothing, so giving one makes the account staff.
 */
export function UsersPage() {
  const me = useStaff();
  const [filter, setFilter] = useState<"internal" | "external" | "all">("internal");
  const [search, setSearch] = useState("");
  const [inviting, setInviting] = useState(false);
  const { run, busy } = useAction([["users"]]);

  const { data, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const [profiles, roles, permissions, approvers] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: true }),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("role_permissions").select("role, permission").order("role"),
        supabase.from("document_approvers").select("user_id"),
      ]);
      const approving = new Set((approvers.data ?? []).map((row) => row.user_id));
      if (profiles.error) throw profiles.error;
      const byUser = new Map<string, AppRole[]>();
      for (const row of roles.data ?? []) byUser.set(row.user_id, [...(byUser.get(row.user_id) ?? []), row.role as AppRole]);
      return {
        users: (profiles.data ?? []).map((profile) => ({ ...profile, roles: byUser.get(profile.id) ?? [], approver: approving.has(profile.id) })) as User[],
        permissions: permissions.data ?? [],
      };
    },
  });

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.users ?? []).filter(
      (user) => (filter === "all" || user.user_type === filter) && (!query || `${user.full_name ?? ""} ${user.email ?? ""} ${user.company ?? ""}`.toLowerCase().includes(query)),
    );
  }, [data, filter, search]);

  const setRoles = (user: User, roles: AppRole[]) =>
    run(`roles:${user.id}`, async () => {
      const add = roles.filter((role) => !user.roles.includes(role));
      const remove = user.roles.filter((role) => !roles.includes(role));
      if (add.length && user.user_type !== "internal") {
        const { error } = await supabase.from("profiles").update({ user_type: "internal" }).eq("id", user.id);
        if (error) throw error;
      }
      for (const role of add) {
        const { error } = await supabase.from("user_roles").insert({ user_id: user.id, role });
        if (error) throw error;
      }
      for (const role of remove) {
        const { error } = await supabase.from("user_roles").delete().eq("user_id", user.id).eq("role", role);
        if (error) throw error;
      }
    }, "Roles saved.");

  // Who may approve quotations and invoices (the database checks it too).
  const setApprover = (user: User, approver: boolean) =>
    run(`approver:${user.id}`, async () => {
      const { error } = await supabase.rpc("set_document_approver", { p_user_id: user.id, p_approver: approver });
      if (error) throw error;
    }, approver ? `${user.full_name || user.email} can now approve quotations and invoices.` : `${user.full_name || user.email} no longer approves.`);

  const setStaff = (user: User, internal: boolean) =>
    run(`type:${user.id}`, async () => {
      const { error } = await supabase.from("profiles").update({ user_type: internal ? "internal" : "external" }).eq("id", user.id);
      if (error) throw error;
      if (internal) {
        // Somewhere to start; widen it from here.
        await supabase.from("user_roles").insert({ user_id: user.id, role: "viewer" });
      } else {
        await supabase.from("user_roles").delete().eq("user_id", user.id);
      }
    }, internal ? "Now on the team, as a viewer." : "No longer on the team.");

  const columns: TableColumnsType<User> = [
    {
      title: "Person",
      key: "person",
      render: (_, user) => (
        <Flex gap={10} align="center">
          <Avatar src={user.avatar_url ?? undefined}>{(user.full_name || user.email || "?")[0]?.toUpperCase()}</Avatar>
          <Flex vertical>
            <Typography.Text strong>
              {user.full_name || "—"}
              {user.id === me.id ? <Tag style={{ marginLeft: 6 }}>you</Tag> : null}
            </Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {user.email}
              {user.company ? ` · ${user.company}` : ""}
            </Typography.Text>
          </Flex>
        </Flex>
      ),
    },
    { title: "Type", dataIndex: "user_type", render: (value: string) => (value === "internal" ? <Tag color="orange">Team</Tag> : <Tag>Customer</Tag>) },
    {
      title: "Roles",
      key: "roles",
      render: (_, user) =>
        user.user_type === "internal" ? (
          <Select<AppRole[]>
            mode="multiple"
            size="small"
            value={user.roles}
            disabled={user.id === me.id}
            loading={busy === `roles:${user.id}`}
            onChange={(roles) => setRoles(user, roles)}
            options={ROLES.map((role) => ({ value: role, label: <Tooltip title={ROLE_HINT[role]}>{role}</Tooltip> }))}
            style={{ minWidth: 220 }}
            placeholder="No role"
          />
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        ),
    },
    {
      title: (
        <Tooltip title="Approvers send quotations and invoices straight away, and approve everyone else's. They also need the sales (quotations) or licensing (invoices) permission.">
          Approver
        </Tooltip>
      ),
      key: "approver",
      render: (_, user) =>
        user.user_type === "internal" ? (
          <Switch size="small" checked={user.approver} loading={busy === `approver:${user.id}`} onChange={(checked) => setApprover(user, checked)} aria-label={`${user.full_name || user.email} can approve`} />
        ) : null,
    },
    { title: "Joined", dataIndex: "created_at", render: (value: string) => formatInvoiceDate(value), responsive: ["md"] },
    {
      title: <span className="sr-only">Actions</span>,
      key: "actions",
      align: "right",
      render: (_, user) =>
        user.id === me.id ? null : user.user_type === "internal" ? (
          <Popconfirm title={`Remove ${user.full_name || user.email} from the team?`} description="Their roles are removed; the account stays, as a customer." okText="Remove" okButtonProps={{ danger: true }} onConfirm={() => setStaff(user, false)}>
            <Button size="small" danger loading={busy === `type:${user.id}`}>
              Remove from team
            </Button>
          </Popconfirm>
        ) : (
          <Popconfirm title={`Make ${user.full_name || user.email} a team member?`} description="They start as a viewer; give them roles after." okText="Make staff" onConfirm={() => setStaff(user, true)}>
            <Button size="small" loading={busy === `type:${user.id}`}>
              Make staff
            </Button>
          </Popconfirm>
        ),
    },
  ];

  const matrix = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const row of data?.permissions ?? []) map.set(row.role, [...(map.get(row.role) ?? []), row.permission]);
    return map;
  }, [data]);

  return (
    <>
      <PageTitle
        title="Users & roles"
        description="The team and the customers. Staff join by invitation; customers sign up on the website."
        actions={
          <Button type="primary" icon={<UserAddOutlined />} onClick={() => setInviting(true)}>
            Invite someone
          </Button>
        }
      />
      <Card>
        <Flex wrap gap={12} justify="space-between" style={{ marginBottom: 16 }}>
          <Segmented
            value={filter}
            onChange={(value) => setFilter(value as typeof filter)}
            options={[
              { value: "internal", label: `Team (${(data?.users ?? []).filter((user) => user.user_type === "internal").length})` },
              { value: "external", label: `Customers (${(data?.users ?? []).filter((user) => user.user_type === "external").length})` },
              { value: "all", label: "Everyone" },
            ]}
          />
          <Input.Search allowClear placeholder="Search name, email or company" onChange={(event) => setSearch(event.target.value)} style={{ maxWidth: 300 }} />
        </Flex>
        <Table<User> rowKey="id" loading={isLoading} columns={columns} dataSource={rows} pagination={{ pageSize: 50, hideOnSinglePage: true }} scroll={{ x: 820 }} />
        <Collapse
          style={{ marginTop: 16 }}
          items={[
            {
              key: "matrix",
              label: "What each role can do",
              children: (
                <Flex vertical gap={8}>
                  {ROLES.map((role) => (
                    <Flex key={role} gap={8} wrap align="center">
                      <Tag color="orange" style={{ minWidth: 72, textAlign: "center" }}>
                        {role}
                      </Tag>
                      {(matrix.get(role) ?? []).map((permission) => (
                        <Tag key={permission}>{permission}</Tag>
                      ))}
                    </Flex>
                  ))}
                </Flex>
              ),
            },
          ]}
        />
      </Card>
      <InviteModal open={inviting} onClose={() => setInviting(false)} />
    </>
  );
}

type InviteValues = { email: string; full_name: string; user_type: "internal" | "external"; role: AppRole | "" };

/** Sends a Supabase invitation (the invite-user edge function holds the service key). */
function InviteModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm<InviteValues>();
  const type = Form.useWatch("user_type", form);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { run } = useAction([["users"]]);

  const invite = async (values: InviteValues) => {
    setPending(true);
    setError(null);
    const { data, error: invokeError } = await supabase.functions.invoke<{ id?: string; error?: string }>("invite-user", {
      body: {
        email: values.email.trim().toLowerCase(),
        full_name: values.full_name?.trim() || undefined,
        user_type: values.user_type,
        role: values.user_type === "internal" ? values.role || undefined : undefined,
      },
    });
    let failure = data?.error;
    if ((invokeError || !data?.id) && !failure && invokeError && "context" in invokeError) {
      try {
        failure = ((await (invokeError.context as Response).json()) as { error?: string }).error;
      } catch {
        failure = undefined;
      }
    }
    setPending(false);
    if (invokeError || !data?.id) return setError(failure ?? "The invitation could not be sent. Please try again.");
    message.success(`Invitation sent to ${values.email}.`);
    form.resetFields();
    await run("refresh", async () => undefined);
    onClose();
  };

  return (
    <Modal open={open} onCancel={onClose} title="Invite someone" okText="Send invitation" confirmLoading={pending} onOk={() => form.submit()} destroyOnHidden>
      <Typography.Paragraph type="secondary">They get an email with a link to set a password. Customers usually sign up themselves on the website.</Typography.Paragraph>
      {error ? <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} /> : null}
      <Form<InviteValues> form={form} layout="vertical" initialValues={{ email: "", full_name: "", user_type: "internal", role: "viewer" }} onFinish={invite}>
        <Form.Item label="Email" name="email" rules={[{ required: true, type: "email", message: "Enter a valid email address" }]}>
          <Input />
        </Form.Item>
        <Form.Item label="Name" name="full_name">
          <Input />
        </Form.Item>
        <Form.Item label="Account" name="user_type">
          <Radio.Group options={[{ value: "internal", label: "Team member" }, { value: "external", label: "Customer" }]} />
        </Form.Item>
        {type === "internal" ? (
          <Form.Item label="Role" name="role" extra="More can be added after.">
            <Select options={ROLES.map((role) => ({ value: role, label: `${role} — ${ROLE_HINT[role]}` }))} />
          </Form.Item>
        ) : null}
      </Form>
    </Modal>
  );
}
