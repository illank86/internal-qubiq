import { Suspense, useMemo, useState } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router";
import { Avatar, Button, Drawer, Dropdown, Flex, Grid, Layout, Menu, Skeleton, Tag, Typography, theme } from "antd";
import type { MenuProps } from "antd";
import { DashboardOutlined, DownOutlined, LogoutOutlined, MenuOutlined, MoonOutlined, SunOutlined } from "@ant-design/icons";
import { useAuth, useCan, useStaff } from "@/auth/use-auth";
import { Brand, FullPageSpinner } from "@/components/ui";
import { NAV } from "@/nav";
import { useThemeMode } from "@/theme-mode";

/** Signed-in pages only; staff only (the auth provider signs anyone else out). */
export function RequireStaff() {
  const { state } = useAuth();
  const location = useLocation();
  if (state.status === "loading") return <FullPageSpinner />;
  if (state.status === "signed-out") return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <AppShell />;
}

const SIDER_WIDTH = 248;

function SideMenu({ onNavigate }: { onNavigate?: () => void }) {
  const can = useCan();
  const navigate = useNavigate();
  const location = useLocation();

  const items = useMemo<MenuProps["items"]>(
    () => [
      { key: "/", icon: <DashboardOutlined />, label: "Dashboard" },
      ...NAV.map((group) => ({
        type: "group" as const,
        key: group.heading,
        label: group.heading,
        children: group.items
          .filter((item) => item.permissions.some(can))
          .map((item) => ({
            key: item.path,
            icon: <item.icon />,
            label: (
              <Flex justify="space-between" align="center" gap={8}>
                <span>{item.label}</span>
                {!item.ready ? (
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                    soon
                  </Typography.Text>
                ) : null}
              </Flex>
            ),
          })),
      })).filter((group) => group.children.length > 0),
    ],
    [can],
  );

  const selected = location.pathname === "/" ? "/" : (NAV.flatMap((group) => group.items).find((item) => location.pathname.startsWith(item.path))?.path ?? "");

  return (
    <Menu
      mode="inline"
      items={items}
      selectedKeys={[selected]}
      onClick={({ key }) => {
        navigate(key);
        onNavigate?.();
      }}
      style={{ borderInlineEnd: "none", paddingBottom: 24 }}
    />
  );
}

function AppShell() {
  const staff = useStaff();
  const { signOut } = useAuth();
  const { dark, toggle } = useThemeMode();
  const screens = Grid.useBreakpoint();
  const [drawer, setDrawer] = useState(false);
  const { token } = theme.useToken();
  const desktop = Boolean(screens.lg);

  const name = staff.profile?.full_name || staff.email;
  const initials = name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  // The role that says most about the person, for the header; all of them in the menu.
  const ROLE_ORDER = ["admin", "licensing", "editor", "viewer"] as const;
  const mainRole = ROLE_ORDER.find((role) => staff.roles.includes(role));
  const roleLabel = (role: string) => role[0].toUpperCase() + role.slice(1);

  const account: MenuProps["items"] = [
    {
      key: "who",
      disabled: true,
      style: { cursor: "default" },
      label: (
        <Flex vertical gap={6} style={{ padding: "4px 0", minWidth: 220 }}>
          <div style={{ lineHeight: 1.4 }}>
            <Typography.Text strong>{name}</Typography.Text>
            <br />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {staff.email}
            </Typography.Text>
          </div>
          {staff.roles.length ? (
            <Flex gap={4} wrap>
              {ROLE_ORDER.filter((role) => staff.roles.includes(role)).map((role) => (
                <Tag key={role} color={role === mainRole ? "orange" : undefined} style={{ marginInlineEnd: 0 }}>
                  {roleLabel(role)}
                </Tag>
              ))}
            </Flex>
          ) : null}
        </Flex>
      ),
    },
    { type: "divider" },
    { key: "theme", icon: dark ? <SunOutlined /> : <MoonOutlined />, label: dark ? "Light theme" : "Dark theme", onClick: toggle },
    { key: "signout", icon: <LogoutOutlined />, label: "Sign out", danger: true, onClick: () => void signOut() },
  ];

  return (
    <Layout style={{ minHeight: "100dvh" }}>
      {desktop ? (
        <Layout.Sider
          width={SIDER_WIDTH}
          style={{
            position: "sticky",
            top: 0,
            height: "100dvh",
            overflowY: "auto",
            borderInlineEnd: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          {/* Stays at the top while the menu scrolls under it. */}
          <div
            style={{
              position: "sticky",
              top: 0,
              zIndex: 2,
              height: 64,
              display: "flex",
              alignItems: "center",
              padding: "0 20px",
              borderBottom: `1px solid ${token.colorBorderSecondary}`,
              background: dark ? "#1f1f1f" : "#ffffff",
            }}
          >
            <Brand />
          </div>
          <SideMenu />
        </Layout.Sider>
      ) : (
        <Drawer
          open={drawer}
          onClose={() => setDrawer(false)}
          placement="left"
          size={SIDER_WIDTH + 32}
          title={<Brand />}
          styles={{ body: { padding: 0 } }}
        >
          <SideMenu onNavigate={() => setDrawer(false)} />
        </Drawer>
      )}

      <Layout>
        <Layout.Header
          style={{
            position: "sticky",
            top: 0,
            zIndex: 10,
            display: "flex",
            alignItems: "center",
            gap: 12,
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          {!desktop ? (
            <>
              <Button type="text" icon={<MenuOutlined />} aria-label="Open menu" onClick={() => setDrawer(true)} />
              <Brand compact />
            </>
          ) : null}
          <Flex align="center" gap={12} style={{ marginLeft: "auto" }}>
            <Dropdown menu={{ items: account }} trigger={["click"]} placement="bottomRight">
              <Button type="text" style={{ height: 48, paddingInline: 8 }} aria-label="Account menu">
                <Flex align="center" gap={10}>
                  <Avatar style={{ backgroundColor: token.colorPrimary, flexShrink: 0 }}>{initials}</Avatar>
                  {screens.sm ? (
                    <Flex vertical align="flex-start" style={{ lineHeight: 1.25, textAlign: "left" }}>
                      <Typography.Text strong style={{ fontSize: 13 }}>
                        {name}
                      </Typography.Text>
                      {mainRole ? (
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          {roleLabel(mainRole)}
                        </Typography.Text>
                      ) : null}
                    </Flex>
                  ) : null}
                  <DownOutlined style={{ fontSize: 10, opacity: 0.5 }} />
                </Flex>
              </Button>
            </Dropdown>
          </Flex>
        </Layout.Header>
        <Layout.Content style={{ padding: desktop ? "28px 32px" : "20px 16px" }}>
          <Suspense fallback={<Skeleton active paragraph={{ rows: 8 }} />}>
            <Outlet />
          </Suspense>
        </Layout.Content>
      </Layout>
    </Layout>
  );
}

/** Page heading, left-aligned, with optional actions on the right. */
export function PageTitle({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <Flex justify="space-between" align="flex-start" wrap gap={16} style={{ marginBottom: 24 }}>
      <div style={{ minWidth: 0 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          {title}
        </Typography.Title>
        {description ? (
          <Typography.Paragraph type="secondary" style={{ margin: "6px 0 0", maxWidth: 720 }}>
            {description}
          </Typography.Paragraph>
        ) : null}
      </div>
      {actions ? <Flex gap={8}>{actions}</Flex> : null}
    </Flex>
  );
}
