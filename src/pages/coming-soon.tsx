import { ExternalLink } from "lucide-react";
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
      <div className="max-w-xl rounded-2xl border border-dashed border-border-strong bg-surface p-6 text-sm">
        <p className="font-medium">Moving here in phase {item.phase}.</p>
        <p className="mt-2 text-muted-foreground">
          Until then, use it on the website&rsquo;s admin — same data, same account.
        </p>
        <a
          href={`${env.siteUrl}${item.legacy}`}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
        >
          Open {item.label} on goqubiq.com
          <ExternalLink aria-hidden className="size-3.5" />
        </a>
      </div>
    </>
  );
}

export function NotFoundPage() {
  return (
    <>
      <PageTitle title="Page not found" description="That address is not part of this app." />
    </>
  );
}
