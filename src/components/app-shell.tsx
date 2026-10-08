import { useMemo, useState } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router";
import { Avatar, Button, Drawer, Dropdown, Flex, Grid, Layout, Menu, Tag, Typography, theme } from "antd";
import type { MenuProps } from "antd";
import { DashboardOutlined, LogoutOutlined, MenuOutlined, MoonOutlined, SunOutlined } from "@ant-design/icons";
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

  const account: MenuProps["items"] = [
    {
      key: "who",
      disabled: true,
      label: (
        <div style={{ lineHeight: 1.4 }}>
          <Typography.Text strong>{name}</Typography.Text>
          <br />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {staff.email}
          </Typography.Text>
        </div>
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
          <div style={{ height: 64, display: "flex", alignItems: "center", padding: "0 20px", borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
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
            {staff.roles.map((role) => (
              <Tag key={role} style={{ marginInlineEnd: 0, textTransform: "capitalize" }}>
                {role}
              </Tag>
            ))}
            <Dropdown menu={{ items: account }} trigger={["click"]} placement="bottomRight">
              <Button type="text" style={{ height: 40, paddingInline: 6 }} aria-label="Account menu">
                <Flex align="center" gap={8}>
                  <Avatar style={{ backgroundColor: token.colorPrimary }}>{initials}</Avatar>
                  {screens.sm ? <span>{name}</span> : null}
                </Flex>
              </Button>
            </Dropdown>
          </Flex>
        </Layout.Header>
        <Layout.Content style={{ padding: desktop ? "28px 32px" : "20px 16px" }}>
          <Outlet />
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
