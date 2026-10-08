import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Card, Col, Empty, Row, Statistic, Typography } from "antd";
import { BugOutlined, ContactsOutlined, FileDoneOutlined, InboxOutlined, KeyOutlined, TransactionOutlined } from "@ant-design/icons";
import { useCan, useStaff } from "@/auth/use-auth";
import { PageTitle } from "@/components/app-shell";
import { supabase } from "@/lib/supabase";
import type { AppPermission } from "@/lib/types";

type Tile = {
  label: string;
  hint: string;
  to: string;
  icon: React.ReactNode;
  permission: AppPermission;
  count: () => PromiseLike<{ count: number | null }>;
};

/**
 * What needs someone's attention. Each count is a head-only query, so it
 * costs a row count, not the rows; RLS answers 0 for anything this staff
 * member may not see, and the tile is hidden for them anyway.
 */
const TILES: Tile[] = [
  {
    label: "New quote requests",
    hint: "From the pricing page",
    to: "/sales/quote-requests",
    icon: <InboxOutlined />,
    permission: "leads.manage",
    count: () => supabase.from("quote_requests").select("id", { count: "exact", head: true }).eq("status", "new"),
  },
  {
    label: "Quotations awaiting reply",
    hint: "Sent, not yet answered",
    to: "/sales/quotations",
    icon: <FileDoneOutlined />,
    permission: "leads.manage",
    count: () => supabase.from("quotations").select("id", { count: "exact", head: true }).eq("status", "sent"),
  },
  {
    label: "Unpaid invoices",
    hint: "Waiting for payment",
    to: "/sales/invoices",
    icon: <TransactionOutlined />,
    permission: "licenses.manage",
    count: () => supabase.from("invoices").select("id", { count: "exact", head: true }).eq("status", "unpaid"),
  },
  {
    label: "Licence requests",
    hint: "Fingerprints waiting for a .qlf",
    to: "/licensing/licences",
    icon: <KeyOutlined />,
    permission: "licenses.manage",
    count: () => supabase.from("licenses").select("id", { count: "exact", head: true }).eq("status", "pending"),
  },
  {
    label: "New bug reports",
    hint: "Not triaged yet",
    to: "/community/bug-reports",
    icon: <BugOutlined />,
    permission: "content.manage",
    count: () => supabase.from("bug_reports").select("id", { count: "exact", head: true }).eq("status", "new"),
  },
  {
    label: "New leads",
    hint: "Contact-form enquiries",
    to: "/sales/leads",
    icon: <ContactsOutlined />,
    permission: "leads.manage",
    count: () => supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "new"),
  },
];

function CountTile({ tile }: { tile: Tile }) {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard", tile.label],
    queryFn: async () => (await tile.count()).count ?? 0,
  });
  return (
    <Card hoverable onClick={() => navigate(tile.to)} style={{ height: "100%" }}>
      <Statistic title={tile.label} value={isError ? "—" : (data ?? 0)} loading={isLoading} prefix={tile.icon} />
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {tile.hint}
      </Typography.Text>
    </Card>
  );
}

export function DashboardPage() {
  const staff = useStaff();
  const can = useCan();
  const tiles = TILES.filter((tile) => can(tile.permission));
  const name = staff.profile?.full_name?.split(/\s+/)[0];

  return (
    <>
      <PageTitle title={name ? `Hello, ${name}` : "Dashboard"} description="What needs attention across sales, licensing and support." />
      {tiles.length > 0 ? (
        <Row gutter={[16, 16]}>
          {tiles.map((tile) => (
            <Col key={tile.label} xs={24} sm={12} xl={8}>
              <CountTile tile={tile} />
            </Col>
          ))}
        </Row>
      ) : (
        <Empty description="Your role has no queues to watch. Use the menu to get to your work." />
      )}
    </>
  );
}
