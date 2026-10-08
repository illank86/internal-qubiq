import { useNavigate } from "react-router";
import { Button, Card, Result } from "antd";
import { ExportOutlined } from "@ant-design/icons";
import { PageTitle } from "@/components/app-shell";
import { env } from "@/lib/env";
import type { NavItem } from "@/nav";

/**
 * A screen that has not moved here yet. Both apps share one database, so the
 * website's /admin keeps working for it in the meantime.
 */
export function ComingSoonPage({ item }: { item: NavItem }) {
  return (
    <>
      <PageTitle title={item.label} description={item.summary} />
      <Card>
        <Result
          status="info"
          title={`Moving here in phase ${item.phase}`}
          subTitle="Until then, use it on the website's admin — same data, same account."
          extra={
            <Button type="primary" icon={<ExportOutlined />} href={`${env.siteUrl}${item.legacy}`} target="_blank" rel="noreferrer">
              Open {item.label} on goqubiq.com
            </Button>
          }
        />
      </Card>
    </>
  );
}

export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <Result
      status="404"
      title="Page not found"
      subTitle="That address is not part of this app."
      extra={
        <Button type="primary" onClick={() => navigate("/")}>
          Back to the dashboard
        </Button>
      }
    />
  );
}
