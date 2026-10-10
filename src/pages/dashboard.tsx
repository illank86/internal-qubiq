import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Button, Card, Col, Empty, Flex, Progress, Row, Skeleton, Tag, Timeline, Typography, theme } from "antd";
import {
  ArrowRightOutlined,
  BugOutlined,
  ContactsOutlined,
  ExportOutlined,
  FileDoneOutlined,
  InboxOutlined,
  KeyOutlined,
  FundOutlined,
} from "@ant-design/icons";
import { useCan, useStaff } from "@/auth/use-auth";
import { PageTitle } from "@/components/app-shell";
import { env } from "@/lib/env";
import { PipelineFlow } from "@/features/dashboard/sales-money";
import { supabase } from "@/lib/supabase";
import type { AppPermission } from "@/lib/types";

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
const shortDate = (value: string) => new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** Everything the dashboard shows, in one round of queries; RLS answers nothing for what a role cannot see. */
async function loadDashboard(can: (permission: AppPermission) => boolean) {
  const none = Promise.resolve({ data: null, count: null });
  const sales = can("leads.manage");
  const licensing = can("licenses.manage");
  const [leads, requests, quotations, licences, bugs, integrators, recentRequests, recentLeads, activity] = await Promise.all([
    sales ? supabase.from("leads").select("status, created_at").limit(5000) : none,
    sales ? supabase.from("quote_requests").select("status, created_at").limit(5000) : none,
    can("quotations.manage") ? supabase.from("quotations").select("status, valid_until").limit(5000) : none,
    licensing ? supabase.from("licenses").select("id", { count: "exact", head: true }).eq("status", "pending") : none,
    sales ? supabase.from("bug_reports").select("status, severity").limit(5000) : none,
    can("content.manage") ? supabase.from("integrators").select("id", { count: "exact", head: true }).eq("status", "pending") : none,
    sales ? supabase.from("quote_requests").select("id, reference, company, contact_name, edition_name, status, created_at").order("created_at", { ascending: false }).limit(5) : none,
    sales ? supabase.from("leads").select("id, name, company, type, status, created_at").order("created_at", { ascending: false }).limit(5) : none,
    supabase.from("audit_log").select("id, action, resource, summary, actor_email, created_at").order("created_at", { ascending: false }).limit(8),
  ]);

  const monthAgo = daysAgo(30);
  const leadRows = leads.data ?? [];
  const requestRows = requests.data ?? [];
  const quoteRows = quotations.data ?? [];
  const bugRows = bugs.data ?? [];
  const closed = ["fixed", "wont_fix", "duplicate", "cannot_reproduce"];
  const isExpired = (row: { status: string; valid_until: string }) => row.status === "sent" && row.valid_until < today();
  const open = quoteRows.filter((row) => row.status === "sent" && !isExpired(row));

  return {
    leads: { fresh: leadRows.filter((row) => row.status === "new").length, month: leadRows.filter((row) => row.created_at > monthAgo).length },
    requests: { fresh: requestRows.filter((row) => row.status === "new").length, month: requestRows.filter((row) => row.created_at > monthAgo).length },
    quotations: {
      draft: quoteRows.filter((row) => row.status === "draft").length,
      open: open.length,
      expired: quoteRows.filter(isExpired).length,
      accepted: quoteRows.filter((row) => row.status === "accepted").length,
      lost: quoteRows.filter((row) => row.status === "declined" || row.status === "cancelled").length,
    },
    licences: licences.count ?? 0,
    bugs: {
      open: bugRows.filter((row) => !closed.includes(row.status)).length,
      resolved: bugRows.filter((row) => closed.includes(row.status)).length,
      critical: bugRows.filter((row) => !closed.includes(row.status) && row.severity === "critical").length,
      bySeverity: (["critical", "high", "medium", "low"] as const)
        .map((severity) => ({ severity, count: bugRows.filter((row) => !closed.includes(row.status) && row.severity === severity).length }))
        .filter((row) => row.count > 0),
    },
    integrators: integrators.count ?? 0,
    recentRequests: recentRequests.data ?? [],
    recentLeads: recentLeads.data ?? [],
    activity: activity.data ?? [],
  };
}

type Data = Awaited<ReturnType<typeof loadDashboard>>;

/** A headline figure: what it is, the number, and the context that makes it mean something. */
function Kpi({ label, value, hint, icon, color, to, alert }: { label: string; value: React.ReactNode; hint: React.ReactNode; icon: React.ReactNode; color: string; to: string; alert?: boolean }) {
  const navigate = useNavigate();
  const { token } = theme.useToken();
  return (
    <Card hoverable onClick={() => navigate(to)} style={{ height: "100%" }} styles={{ body: { padding: 20 } }}>
      <Flex justify="space-between" align="flex-start" gap={12}>
        <div style={{ minWidth: 0 }}>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            {label}
          </Typography.Text>
          <div style={{ fontSize: "clamp(20px, 1vw + 14px, 28px)", fontWeight: 600, lineHeight: 1.25, margin: "6px 0 4px", fontVariantNumeric: "tabular-nums", color: alert ? token.colorError : token.colorText, overflowWrap: "anywhere" }}>
            {value}
          </div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {hint}
          </Typography.Text>
        </div>
        <Flex align="center" justify="center" style={{ width: 44, height: 44, borderRadius: 12, background: `${color}1a`, color, fontSize: 20, flexShrink: 0 }}>
          {icon}
        </Flex>
      </Flex>
    </Card>
  );
}

function Panel({ title, to, children, extra }: { title: string; to?: string; children: React.ReactNode; extra?: React.ReactNode }) {
  const navigate = useNavigate();
  return (
    <Card
      title={title}
      style={{ height: "100%" }}
      extra={
        extra ??
        (to ? (
          <Button type="link" size="small" onClick={() => navigate(to)} style={{ paddingInline: 0 }}>
            View all <ArrowRightOutlined />
          </Button>
        ) : null)
      }
    >
      {children}
    </Card>
  );
}

function BugHealth({ data }: { data: Data["bugs"] }) {
  const total = data.open + data.resolved;
  const share = total ? Math.round((data.resolved / total) * 100) : 100;
  return (
    <Flex vertical gap={16}>
      <Flex align="center" gap={20}>
        <Progress type="dashboard" percent={share} size={96} strokeColor={undefined} format={(percent) => <span style={{ fontSize: 18 }}>{percent}%</span>} />
        <Flex vertical gap={4}>
          <Typography.Text>
            <Typography.Text strong style={{ fontSize: 22 }}>
              {data.open}
            </Typography.Text>{" "}
            <Typography.Text type="secondary">still open</Typography.Text>
          </Typography.Text>
          <Typography.Text type="secondary">{data.resolved} resolved, all time</Typography.Text>
        </Flex>
      </Flex>
      {data.bySeverity.length ? (
        <Flex gap={6} wrap>
          {data.bySeverity.map((row) => (
            <Tag key={row.severity} color={row.severity === "critical" ? "red" : row.severity === "high" ? "orange" : undefined}>
              {row.count} {row.severity}
            </Tag>
          ))}
        </Flex>
      ) : (
        <Typography.Text type="secondary">Nothing open. Everything filed is closed.</Typography.Text>
      )}
    </Flex>
  );
}

function Rows({ items, empty }: { items: { key: string; title: React.ReactNode; detail: React.ReactNode; right: React.ReactNode; onClick: () => void }[]; empty: string }) {
  const { token } = theme.useToken();
  if (items.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={empty} />;
  return (
    <div style={{ margin: "-12px -24px -24px" }}>
      {items.map((item, index) => (
        <Flex
          key={item.key}
          align="center"
          gap={12}
          onClick={item.onClick}
          style={{ padding: "12px 24px", cursor: "pointer", borderTop: index ? `1px solid ${token.colorBorderSecondary}` : undefined }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <Typography.Text strong ellipsis style={{ display: "block" }}>
              {item.title}
            </Typography.Text>
            <Typography.Text type="secondary" ellipsis style={{ display: "block", fontSize: 12 }}>
              {item.detail}
            </Typography.Text>
          </div>
          {item.right}
        </Flex>
      ))}
    </div>
  );
}

const ACTION_COLOR: Record<string, string> = { create: "green", update: "blue", delete: "red" };

export function DashboardPage() {
  const staff = useStaff();
  const can = useCan();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ["dashboard", staff.permissions.join()], queryFn: () => loadDashboard(can) });
  const first = staff.profile?.full_name?.split(/\s+/)[0];
  const sales = can("leads.manage");
  const licensing = can("licenses.manage");
  const finance = can("accounting.manage");

  return (
    <>
      <PageTitle
        title={first ? `Welcome back, ${first}` : "Welcome back"}
        description="What needs attention across sales, licensing and support. Money and revenue are on the Finance dashboard."
        actions={
          <Flex gap={12} align="center" wrap>
            {finance ? (
              <Button icon={<FundOutlined />} onClick={() => navigate("/finance")}>
                Finance dashboard
              </Button>
            ) : null}
            <Button icon={<ExportOutlined />} href={env.siteUrl} target="_blank" rel="noreferrer">
              View site
            </Button>
          </Flex>
        }
      />
      {isLoading || !data ? (
        <Skeleton active paragraph={{ rows: 10 }} />
      ) : (
        <Flex vertical gap={16}>
          <Row gutter={[16, 16]}>
            {sales ? (
              <Col xs={24} sm={12} xl={6}>
                <Kpi
                  label="Quotations awaiting reply"
                  value={data.quotations.open}
                  hint={data.quotations.expired ? `${data.quotations.expired} expired, to renew` : `${data.quotations.accepted} accepted so far`}
                  icon={<FileDoneOutlined />}
                  color="#1677ff"
                  to="/sales/quotations"
                />
              </Col>
            ) : null}
            {sales ? (
              <Col xs={24} sm={12} xl={6}>
                <Kpi
                  label="New enquiries"
                  value={data.requests.fresh + data.leads.fresh}
                  hint={`${data.requests.fresh} quote requests · ${data.leads.fresh} leads`}
                  icon={<InboxOutlined />}
                  color="#fa8c16"
                  to="/sales/quote-requests"
                />
              </Col>
            ) : null}
            {licensing ? (
              <Col xs={24} sm={12} xl={6}>
                <Kpi label="Licence requests" value={data.licences} hint={data.licences ? "Fingerprints waiting for a .qlf" : "Nothing waiting"} icon={<KeyOutlined />} color="#13c2c2" to="/licensing/licences" />
              </Col>
            ) : null}
            {sales ? (
              <Col xs={24} sm={12} xl={6}>
                <Kpi label="Open bug reports" value={data.bugs.open} hint={data.bugs.critical ? `${data.bugs.critical} critical` : "None critical"} icon={<BugOutlined />} color="#f5222d" to="/community/bug-reports" alert={data.bugs.critical > 0} />
              </Col>
            ) : null}
          </Row>

          {sales ? (
            <Row gutter={[16, 16]}>
              {sales ? (
                <Col xs={24} lg={14}>
                  <Panel title="Sales pipeline" to="/sales/quotations">
                    <PipelineFlow counts={data.quotations} />
                  </Panel>
                </Col>
              ) : null}
              {sales ? (
                <Col xs={24} lg={10}>
                  <Panel title="Bug reports" to="/community/bug-reports">
                    <BugHealth data={data.bugs} />
                  </Panel>
                </Col>
              ) : null}
            </Row>
          ) : null}

          {sales ? (
            <Row gutter={[16, 16]}>
              <Col xs={24} lg={12}>
                <Panel title="Latest quote requests" to="/sales/quote-requests">
                  <Rows
                    empty="No quote requests yet."
                    items={data.recentRequests.map((row) => ({
                      key: row.id,
                      title: row.company || row.contact_name,
                      detail: `${row.reference} · ${row.edition_name ?? "Custom"} · ${shortDate(row.created_at)}`,
                      right: (
                        <Tag style={{ marginInlineEnd: 0 }} color={row.status === "new" ? "processing" : undefined}>
                          {row.status}
                        </Tag>
                      ),
                      onClick: () => navigate("/sales/quote-requests"),
                    }))}
                  />
                </Panel>
              </Col>
              <Col xs={24} lg={12}>
                <Panel title="Latest leads" to="/sales/leads">
                  <Rows
                    empty="No leads yet."
                    items={data.recentLeads.map((row) => ({
                      key: row.id,
                      title: row.company || row.name,
                      detail: `${row.name} · ${row.type} · ${shortDate(row.created_at)}`,
                      right: (
                        <Tag style={{ marginInlineEnd: 0 }} color={row.status === "new" ? "processing" : undefined} icon={<ContactsOutlined />}>
                          {row.status}
                        </Tag>
                      ),
                      onClick: () => navigate("/sales/leads"),
                    }))}
                  />
                </Panel>
              </Col>
            </Row>
          ) : null}

          <Panel title="Recent activity" to={can("users.manage") ? "/system/activity" : undefined}>
            {data.activity.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing recorded yet." />
            ) : (
              <Timeline
                style={{ marginTop: 8, marginBottom: -24 }}
                items={data.activity.map((entry) => ({
                  color: ACTION_COLOR[entry.action] ?? "gray",
                  content: (
                    <Flex justify="space-between" gap={12} wrap>
                      <span>
                        {entry.summary ?? entry.action}{" "}
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          in {entry.resource.replace(/_/g, " ")}
                        </Typography.Text>
                      </span>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {entry.actor_email ?? "system"} · {shortDate(entry.created_at)}
                      </Typography.Text>
                    </Flex>
                  ),
                }))}
              />
            )}
          </Panel>
        </Flex>
      )}
    </>
  );
}
