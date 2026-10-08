import { useEffect } from "react";
import { useNavigate, useRouteError } from "react-router";
import { Button, Flex, Result, Spin } from "antd";

const RELOAD_KEY = "qubiq:reloaded-for-update";

/**
 * After a deploy, a tab opened earlier still asks for the previous build's
 * page files, which no longer exist. One reload picks up the new build. The
 * timestamp keeps it to once, so a real outage cannot loop the page.
 */
export function reloadForUpdate() {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < 15_000) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // Storage blocked: reload anyway; the browser's own cache rules apply.
  }
  window.location.reload();
  return true;
}

export const isStaleBuildError = (error: unknown) =>
  /dynamically imported module|Importing a module script failed|Failed to fetch dynamically imported|error loading dynamically imported/i.test(
    error instanceof Error ? error.message : String(error ?? ""),
  );

/** What a route shows when it fails: a reload for a new version, otherwise a plain explanation. */
export function RouteError() {
  const error = useRouteError();
  const navigate = useNavigate();
  const stale = isStaleBuildError(error);

  useEffect(() => {
    if (stale) reloadForUpdate();
  }, [stale]);

  if (stale) {
    return (
      <Flex vertical align="center" justify="center" gap={16} style={{ minHeight: "60vh" }}>
        <Spin size="large" />
        <Result
          status="info"
          title="QUBIQ Admin was updated"
          subTitle="Loading the new version… If this page stays, reload it."
          extra={
            <Button type="primary" onClick={() => window.location.reload()}>
              Reload
            </Button>
          }
        />
      </Flex>
    );
  }

  console.error("[route]", error);
  return (
    <Result
      status="error"
      title="Something went wrong on this page"
      subTitle="Reload to try again. If it keeps happening, tell us what you were doing."
      extra={[
        <Button key="reload" type="primary" onClick={() => window.location.reload()}>
          Reload
        </Button>,
        <Button key="home" onClick={() => navigate("/")}>
          Go to the dashboard
        </Button>,
      ]}
    />
  );
}
