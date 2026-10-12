import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, App, Avatar, Button, Card, Collapse, Dropdown, Flex, Form, Input, Modal, Radio, Segmented, Select, Switch, Table, Tag, Tooltip, Typography } from "antd";
import type { MenuProps, TableColumnsType } from "antd";
import { DeleteOutlined, LogoutOutlined, MailOutlined, MoreOutlined, StopOutlined, TeamOutlined, UndoOutlined, UserAddOutlined, UserDeleteOutlined } from "@ant-design/icons";
import { useStaff } from "@/auth/use-auth";
import { PageTitle } from "@/components/app-shell";
import { formatInvoiceDate } from "@/lib/invoices";
import { supabase } from "@/lib/supabase";
import type { AppRole, Profile } from "@/lib/types";
import { useAction } from "@/features/sales/use-action";
import { SessionSettingsCard } from "./session-settings-card";

const ROLES: AppRole[] = ["admin", "sales", "licensing", "finance", "editor", "viewer"];
const ROLE_HINT: Record<AppRole, string> = {
  admin: "Everything, including users and roles",
  sales: "Quotations and their settings, tier discounts, and the inbox: leads, quote requests, bug reports, newsletters",
  editor: "Website content, blog, pricing, downloads and the inbox",
  licensing: "Licences and delivery orders (reads invoices)",
  finance: "Invoices and payments, money in and out, journal, tax, company details and ways to pay",
  viewer: "Can sign in and look around",
};
/** invited: invited and no password chosen yet — not active until they do. */
type User = Profile & { roles: AppRole[]; approver: boolean; invited_at: string | null; invited: boolean };

/** How long an invitation link works (Auth's email link lifetime). */
const INVITE_LINK_HOURS = 1;
/** Access is fixed until the invitation is accepted (the database refuses changes too). */
const LOCKED_UNTIL_ACTIVE = "Not active yet: roles and access can be changed once they accept the invitation and choose a password.";

/**
 * Everyone with an account: the team (staff, with roles) and customers.
 * Staff are invited; customers register on the website. A role on a customer
 * account grants nothing, so giving one makes the account staff.
 */
export function UsersPage() {
  const me = useStaff();
  const { modal } = App.useApp();
  const isAdmin = me.roles.includes("admin");
  const [filter, setFilter] = useState<"internal" | "external" | "all">("internal");
  const [search, setSearch] = useState("");
  const [inviting, setInviting] = useState(false);
  const [suspending, setSuspending] = useState<User | null>(null);
  const { run, busy } = useAction([["users"]]);

  const { data, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const [profiles, roles, permissions, approvers, states] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: true }),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("role_permissions").select("role, permission").order("role"),
        supabase.from("document_approvers").select("user_id"),
        supabase.rpc("user_account_status"),
      ]);
      const stateOf = new Map((states.data ?? []).map((row) => [row.user_id, row]));
      const approving = new Set((approvers.data ?? []).map((row) => row.user_id));
      if (profiles.error) throw profiles.error;
      const byUser = new Map<string, AppRole[]>();
      for (const row of roles.data ?? []) byUser.set(row.user_id, [...(byUser.get(row.user_id) ?? []), row.role as AppRole]);
      return {
        users: (profiles.data ?? []).map((profile) => {
          const state = stateOf.get(profile.id);
          return {
            ...profile,
            roles: byUser.get(profile.id) ?? [],
            approver: approving.has(profile.id),
            invited_at: state?.invited_at ?? null,
            invited: Boolean(state?.invited_at && !state.activated),
          };
        }) as User[],
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
    { title: "Status", key: "status", render: (_, user) => <AccountStatus user={user} /> },
    {
      title: "Roles",
      key: "roles",
      render: (_, user) =>
        user.user_type === "internal" ? (
          <Tooltip title={user.invited ? LOCKED_UNTIL_ACTIVE : undefined}>
            <Select<AppRole[]>
              mode="multiple"
              size="small"
              value={user.roles}
              disabled={user.id === me.id || user.invited}
              loading={busy === `roles:${user.id}`}
              onChange={(roles) => setRoles(user, roles)}
              options={ROLES.map((role) => ({ value: role, label: <Tooltip title={ROLE_HINT[role]}>{role}</Tooltip> }))}
              style={{ minWidth: 220 }}
              placeholder="No role"
            />
          </Tooltip>
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
          <Tooltip title={user.invited ? LOCKED_UNTIL_ACTIVE : undefined}>
            <Switch
              size="small"
              checked={user.approver}
              disabled={user.invited}
              loading={busy === `approver:${user.id}`}
              onChange={(checked) => setApprover(user, checked)}
              aria-label={`${user.full_name || user.email} can approve`}
            />
          </Tooltip>
        ) : null,
    },
    { title: "Joined", dataIndex: "created_at", render: (value: string) => formatInvoiceDate(value), responsive: ["md"] },
    {
      title: <span className="sr-only">Actions</span>,
      key: "actions",
      align: "right",
      width: 56,
      render: (_, user) => {
        if (user.id === me.id) return null;
        const who = user.full_name || user.email;
        const items: MenuProps["items"] = [
          ...(isAdmin && user.invited
            ? [
                {
                  key: "resend",
                  icon: <MailOutlined />,
                  label: "Resend invitation",
                  onClick: () =>
                    modal.confirm({
                      title: `Send ${who} a new invitation?`,
                      content: "They get a fresh link to choose a password; the old link stops working.",
                      okText: "Send again",
                      onOk: () => resendInvite(user),
                    }),
                },
                { type: "divider" as const },
              ]
            : []),
          {
            key: "signout",
            icon: <LogoutOutlined />,
            label: "Sign out everywhere",
            onClick: () =>
              modal.confirm({
                title: `Sign ${who} out everywhere?`,
                content: "Every sign-in of this account ends — a forgotten computer, a lost laptop, someone leaving.",
                okText: "Sign out everywhere",
                okButtonProps: { danger: true },
                onOk: () => signOutEverywhere(user),
              }),
          },
          user.user_type === "internal"
            ? {
                key: "type",
                icon: <UserDeleteOutlined />,
                label: "Remove from team",
                disabled: user.invited,
                onClick: () =>
                  modal.confirm({
                    title: `Remove ${who} from the team?`,
                    content: "Their roles are removed; the account stays, as a customer.",
                    okText: "Remove",
                    okButtonProps: { danger: true },
                    onOk: () => setStaff(user, false),
                  }),
              }
            : {
                key: "type",
                icon: <TeamOutlined />,
                label: "Make staff",
                disabled: user.invited,
                onClick: () =>
                  modal.confirm({ title: `Make ${who} a team member?`, content: "They start as a viewer; give them roles after.", okText: "Make staff", onOk: () => setStaff(user, true) }),
              },
          ...(isAdmin
            ? [
                { type: "divider" as const },
                user.suspended_at
                  ? {
                      key: "suspend",
                      icon: <UndoOutlined />,
                      label: "Lift suspension",
                      onClick: () =>
                        modal.confirm({ title: `Let ${who} sign in again?`, content: "Their account, roles and records are as they were.", okText: "Lift suspension", onOk: () => setSuspended(user, false) }),
                    }
                  : { key: "suspend", icon: <StopOutlined />, label: "Suspend…", onClick: () => setSuspending(user) },
                {
                  key: "delete",
                  icon: <DeleteOutlined />,
                  label: "Delete account",
                  danger: true,
                  onClick: () =>
                    modal.confirm({
                      title: `Delete ${who}?`,
                      content: "The account, profile and picture are deleted for good. Documents they worked on keep their history. An account that owns invoices, licences or delivery orders cannot be deleted.",
                      okText: "Delete account",
                      okButtonProps: { danger: true },
                      onOk: () => deleteUser(user),
                    }),
                },
              ]
            : []),
        ];
        const working = busy?.endsWith(`:${user.id}`) ?? false;
        return (
          <Dropdown menu={{ items }} trigger={["click"]} placement="bottomRight">
            <Button type="text" size="small" icon={<MoreOutlined />} loading={working} aria-label={`Actions for ${who}`} />
          </Dropdown>
        );
      },
    },
  ];

  // The invite-user, delete-user and suspend-user edge functions hold the service key; only admins may call them.
  const resendInvite = (user: User) =>
    run(
      `resend:${user.id}`,
      () =>
        callAdminFunction(
          "invite-user",
          { email: user.email, full_name: user.full_name || undefined, user_type: user.user_type, role: user.user_type === "internal" ? user.roles[0] : undefined },
          "The invitation could not be sent again.",
        ),
      `A new invitation is on its way to ${user.email}.`,
    );

  const deleteUser = (user: User) =>
    run(`delete:${user.id}`, () => callAdminFunction("delete-user", { user_id: user.id }, "The account could not be deleted."), `${user.full_name || user.email} is deleted.`);

  const setSuspended = (user: User, suspend: boolean, reason?: string) =>
    run(
      `suspend:${user.id}`,
      () => callAdminFunction("suspend-user", { user_id: user.id, suspend, reason }, suspend ? "The account could not be suspended." : "The suspension could not be lifted."),
      suspend ? `${user.full_name || user.email} is suspended and signed out.` : `${user.full_name || user.email} can sign in again.`,
    );

  const signOutEverywhere = (user: User) =>
    run(
      `signout:${user.id}`,
      async () => {
        const { error: signOutError } = await supabase.rpc("sign_out_everywhere", { p_user: user.id });
        if (signOutError) throw signOutError;
      },
      `${user.full_name || user.email} is signed out everywhere. Their devices close within a few minutes.`,
    );

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
          // Inviting is admin-only; invite-user and the database refuse anyone else too.
          isAdmin ? (
            <Button type="primary" icon={<UserAddOutlined />} onClick={() => setInviting(true)}>
              Invite someone
            </Button>
          ) : null
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
      <SessionSettingsCard />
      {isAdmin ? <InviteModal open={inviting} onClose={() => setInviting(false)} /> : null}
      {suspending ? (
        <SuspendModal
          user={suspending}
          onClose={() => setSuspending(null)}
          onConfirm={(reason) => setSuspended(suspending, true, reason).then((ok) => ok && setSuspending(null))}
        />
      ) : null}
    </>
  );
}

/** Active, invited (not active until they choose a password) or suspended. */
function AccountStatus({ user }: { user: User }) {
  if (user.suspended_at) {
    return (
      <Tooltip title={`Since ${formatInvoiceDate(user.suspended_at)}${user.suspended_reason ? ` — ${user.suspended_reason}` : ""}`}>
        <Tag color="red">Suspended</Tag>
      </Tooltip>
    );
  }
  if (user.invited) {
    const expired = Boolean(user.invited_at && Date.now() - Date.parse(user.invited_at) > INVITE_LINK_HOURS * 3_600_000);
    return (
      <Tooltip
        title={`Invited ${user.invited_at ? formatInvoiceDate(user.invited_at) : ""}. Not active until they open the email and choose a password.${expired ? " The link has expired — resend it from the ⋯ menu." : ""}`}
      >
        <Tag color={expired ? "default" : "gold"}>{expired ? "Invitation expired" : "Invited"}</Tag>
      </Tooltip>
    );
  }
  return <Tag color="green">Active</Tag>;
}

/** Calls an admin-only edge function; its refusal message is shown as is. */
async function callAdminFunction(name: string, body: Record<string, unknown>, fallback: string) {
  const { data, error } = await supabase.functions.invoke<{ id?: string; error?: string }>(name, { body });
  if (!error && data?.id) return;
  let failure = data?.error;
  if (!failure && error && "context" in error) {
    try {
      failure = ((await (error.context as Response).json()) as { error?: string }).error;
    } catch {
      failure = undefined;
    }
  }
  // The code makes useAction show this message rather than a generic one.
  throw { code: "22023", message: failure ?? `${fallback} Please try again.` };
}

/** Suspend with an optional reason, kept on the profile and in the audit log. */
function SuspendModal({ user, onClose, onConfirm }: { user: User; onClose: () => void; onConfirm: (reason: string) => Promise<unknown> }) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <Modal
      open
      title={`Suspend ${user.full_name || user.email}?`}
      okText="Suspend"
      okButtonProps={{ danger: true, loading: pending }}
      onCancel={onClose}
      onOk={async () => {
        setPending(true);
        await onConfirm(reason.trim());
        setPending(false);
      }}
    >
      <Typography.Paragraph type="secondary">
        They are signed out everywhere and cannot sign in until you lift it. {user.user_type === "internal" ? "As staff, they lose every permission at once. " : ""}Nothing is deleted.
      </Typography.Paragraph>
      <Input.TextArea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} showCount autoSize={{ minRows: 2, maxRows: 4 }} placeholder="Reason (optional, for the team)" />
    </Modal>
  );
}

type InviteValues = { email: string; full_name: string; user_type: "internal" | "external"; role: AppRole | "" };

/** Sends a Supabase invitation (the invite-user edge function holds the service key; admins only). */
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
    const { data, error: invokeError } = await supabase.functions.invoke<{ id?: string; status?: "invited" | "resent" | "added"; error?: string }>("invite-user", {
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
    message.success(
      data.status === "added"
        ? `${values.email} already had an account: it is now on the team, and they sign in with their usual password.`
        : data.status === "resent"
          ? `${values.email} was already invited: a new invitation is on its way.`
          : `Invitation sent to ${values.email}. They show as invited until they choose a password.`,
    );
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
