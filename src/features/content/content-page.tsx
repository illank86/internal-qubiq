import { useSearchParams } from "react-router";
import { Card, Result, Tabs } from "antd";
import { useCan } from "@/auth/use-auth";
import { PageTitle } from "@/components/app-shell";
import { ResourceList, SingletonForm } from "./resource-list";
import { CONTENT_SCREENS } from "./content-screens";
import { getResource, type Resource } from "./resources";

function Body({ resource }: { resource: Resource }) {
  return resource.singleton ? <SingletonForm resource={resource} /> : <ResourceList resource={resource} />;
}

/**
 * One content screen: its tables as tabs (?tab= opens one directly). Every
 * save goes straight to the database; the website refreshes by itself.
 */
export function ContentPage({ path }: { path: string }) {
  const screen = CONTENT_SCREENS[path];
  const can = useCan();
  const [params, setParams] = useSearchParams();
  const resources = (screen?.keys ?? []).map(getResource).filter((resource): resource is Resource => Boolean(resource) && can(resource!.permission));

  if (!screen || resources.length === 0) return <Result status="403" title="Nothing here for your role." />;
  const tab = resources.some((resource) => resource.key === params.get("tab")) ? (params.get("tab") as string) : resources[0].key;

  return (
    <>
      <PageTitle title={screen.title} description={resources.length > 1 ? screen.description : undefined} />
      <Card>
        {resources.length > 1 ? (
          <Tabs
            activeKey={tab}
            onChange={(key) => setParams({ tab: key }, { replace: true })}
            destroyOnHidden
            items={resources.map((resource) => ({ key: resource.key, label: resource.label, children: <Body resource={resource} /> }))}
          />
        ) : (
          <Body resource={resources[0]} />
        )}
      </Card>
    </>
  );
}
