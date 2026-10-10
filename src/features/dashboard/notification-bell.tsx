import { useState } from "react";
import { useNavigate } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Avatar, Badge, Button, Empty, Flex, Popover, Spin, Tooltip, Typography, theme } from "antd";
import { AuditOutlined, BellOutlined, BugOutlined, CommentOutlined, ContactsOutlined, GlobalOutlined, InboxOutlined, KeyOutlined, MailOutlined, UserAddOutlined } from "@ant-design/icons";
import { useStaff } from "@/auth/use-auth";
import { loadNotifications, markNotificationsSeen, type NotificationKind } from "./notifications";

const KIND: Record<NotificationKind, { icon: React.ReactNode; color: string }> = {
  lead: { icon: <ContactsOutlined />, color: "#1677ff" },
  quote: { icon: <InboxOutlined />, color: "#fa8c16" },
  bug: { icon: <BugOutlined />, color: "#f5222d" },
  reply: { icon: <CommentOutlined />, color: "#722ed1" },
  license: { icon: <KeyOutlined />, color: "#13c2c2" },
  integrator: { icon: <GlobalOutlined />, color: "#52c41a" },
  account: { icon: <UserAddOutlined />, color: "#8c8c8c" },
  approval: { icon: <AuditOutlined />, color: "#d48806" },
  undelivered: { icon: <MailOutlined />, color: "#cf1322" },
};

function ago(value: string) {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** The header bell: what came in, newest first, with an unread count. Checks every minute. */
export function NotificationBell() {
  const staff = useStaff();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { token } = theme.useToken();
  const [open, setOpen] = useState(false);
  const [marking, setMarking] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["notifications", staff.id],
    queryFn: () => loadNotifications(staff.id, staff.permissions),
    refetchInterval: 60_000,
  });

  // Read is shared with the website's admin: marking here clears it there too.
  const markRead = async () => {
    setMarking(true);
    try {
      await markNotificationsSeen(staff.id);
      await queryClient.invalidateQueries({ queryKey: ["notifications", staff.id] });
    } finally {
      setMarking(false);
    }
  };

  const content = (
    <div style={{ width: 380, maxWidth: "calc(100vw - 32px)" }}>
      <Flex justify="space-between" align="center" style={{ padding: "4px 4px 10px", borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
        <Typography.Text strong>
          Notifications{data?.unread ? <Typography.Text type="secondary" style={{ fontWeight: 400 }}> · {data.unread} new</Typography.Text> : null}
        </Typography.Text>
        {data?.unread ? (
          <Button type="link" size="small" loading={marking} onClick={markRead} style={{ paddingInline: 0 }}>
            Mark all read
          </Button>
        ) : (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            All caught up
          </Typography.Text>
        )}
      </Flex>
      <div style={{ maxHeight: 440, overflowY: "auto", margin: "4px -12px -12px" }}>
        {isLoading ? (
          <Flex justify="center" style={{ padding: 32 }}>
            <Spin />
          </Flex>
        ) : !data || data.items.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Nothing has come in yet. Leads, quote requests, bug reports and replies, licence requests, integrator applications and new accounts land here."
            style={{ padding: 24 }}
          />
        ) : (
          data.items.map((item) => (
            <Flex
              key={item.id}
              gap={12}
              align="flex-start"
              role="button"
              tabIndex={0}
              onClick={() => {
                setOpen(false);
                navigate(item.to);
              }}
              onKeyDown={(event) => event.key === "Enter" && navigate(item.to)}
              style={{
                padding: "10px 16px",
                cursor: "pointer",
                background: item.unread ? token.colorPrimaryBg : undefined,
                borderBottom: `1px solid ${token.colorBorderSecondary}`,
              }}
            >
              <Avatar size={32} style={{ background: `${KIND[item.kind].color}1f`, color: KIND[item.kind].color, flexShrink: 0 }} icon={KIND[item.kind].icon} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <Typography.Text strong={item.unread} ellipsis style={{ display: "block" }}>
                  {item.title}
                </Typography.Text>
                <Typography.Text type="secondary" ellipsis style={{ display: "block", fontSize: 12 }}>
                  {item.detail}
                </Typography.Text>
              </div>
              <Flex vertical align="flex-end" gap={6}>
                <Typography.Text type="secondary" style={{ fontSize: 11, whiteSpace: "nowrap" }}>
                  {ago(item.createdAt)}
                </Typography.Text>
                {item.unread ? <span aria-label="Unread" style={{ width: 8, height: 8, borderRadius: 4, background: token.colorPrimary }} /> : null}
              </Flex>
            </Flex>
          ))
        )}
      </div>
    </div>
  );

  return (
    <Popover content={content} trigger="click" placement="bottomRight" open={open} onOpenChange={setOpen} arrow={false}>
      <Tooltip title="Notifications" open={open ? false : undefined}>
        <Badge count={data?.unread ?? 0} size="small" offset={[-4, 4]}>
          <Button type="text" shape="circle" icon={<BellOutlined style={{ fontSize: 18 }} />} aria-label={`Notifications${data?.unread ? `, ${data.unread} unread` : ""}`} />
        </Badge>
      </Tooltip>
    </Popover>
  );
}
