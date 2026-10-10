import { Button, Result } from "antd";
import { useNavigate } from "react-router";
import { useCan } from "@/auth/use-auth";
import type { AppPermission } from "@/lib/types";

/**
 * A page only for the roles that may use it: the same rule that hides its
 * menu item, so an address typed or bookmarked by someone else shows why
 * instead of an empty screen. The database still checks every read and write.
 */
export function RequirePermission({ permissions, children }: { permissions: AppPermission[]; children: React.ReactNode }) {
  const can = useCan();
  const navigate = useNavigate();
  if (permissions.some(can)) return children;
  return (
    <Result
      status="403"
      title="You don't have access to this page"
      subTitle="Your role doesn't include it. Ask an admin if you need it."
      extra={
        <Button type="primary" onClick={() => navigate("/")}>
          Back to the dashboard
        </Button>
      }
    />
  );
}
