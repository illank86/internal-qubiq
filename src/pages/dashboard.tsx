import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { useCan, useStaff } from "@/auth/use-auth";
import { PageTitle } from "@/components/app-shell";
import { supabase } from "@/lib/supabase";
import type { AppPermission } from "@/lib/types";

type Tile = {
  label: string;
  hint: string;
  to: string;
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
    permission: "leads.manage",
    count: () => supabase.from("quote_requests").select("id", { count: "exact", head: true }).eq("status", "new"),
  },
  {
    label: "Quotations awaiting reply",
    hint: "Sent, not yet answered",
    to: "/sales/quotations",
    permission: "leads.manage",
    count: () => supabase.from("quotations").select("id", { count: "exact", head: true }).eq("status", "sent"),
  },
  {
    label: "Unpaid invoices",
    hint: "Waiting for payment",
    to: "/sales/invoices",
    permission: "licenses.manage",
    count: () => supabase.from("invoices").select("id", { count: "exact", head: true }).eq("status", "unpaid"),
  },
  {
    label: "Licence requests",
    hint: "Fingerprints waiting for a .qlf",
    to: "/licensing/licences",
    permission: "licenses.manage",
    count: () => supabase.from("licenses").select("id", { count: "exact", head: true }).eq("status", "pending"),
  },
  {
    label: "New bug reports",
    hint: "Not triaged yet",
    to: "/community/bug-reports",
    permission: "content.manage",
    count: () => supabase.from("bug_reports").select("id", { count: "exact", head: true }).eq("status", "new"),
  },
  {
    label: "New leads",
    hint: "Contact-form enquiries",
    to: "/sales/leads",
    permission: "leads.manage",
    count: () => supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "new"),
  },
];

function CountTile({ tile }: { tile: Tile }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard", tile.label],
    queryFn: async () => (await tile.count()).count ?? 0,
  });
  return (
    <Link
      to={tile.to}
      className="group flex flex-col gap-1 rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-primary/40"
    >
      <span className="text-sm text-muted-foreground">{tile.label}</span>
      <span className="text-3xl font-semibold tabular-nums">{isLoading ? "…" : isError ? "—" : data}</span>
      <span className="flex items-center justify-between text-xs text-muted-foreground">
        {tile.hint}
        <ArrowRight aria-hidden className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
      </span>
    </Link>
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
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {tiles.map((tile) => (
            <CountTile key={tile.label} tile={tile} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Your role has no queues to watch. Use the menu to get to your work.</p>
      )}
    </>
  );
}
