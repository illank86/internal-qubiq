import { supabase } from "@/lib/supabase";
import type { AppPermission } from "@/lib/types";

export type NotificationKind = "lead" | "quote" | "bug" | "reply" | "integrator" | "license" | "account";

export type NotificationItem = {
  id: string;
  kind: NotificationKind;
  title: string;
  detail: string | null;
  to: string;
  createdAt: string;
  unread: boolean;
};

export type NotificationFeed = { items: NotificationItem[]; unread: number };

/**
 * What has come in from outside: new leads and quote requests, bug reports
 * and customers' replies, licence requests, integrator applications and new
 * accounts — the same feed as the website's admin bell, each opening its
 * screen here. Unread means newer than profiles.notifications_seen_at.
 */
export async function loadNotifications(userId: string, permissions: AppPermission[], limit = 15): Promise<NotificationFeed> {
  const sees = (permission: AppPermission) => permissions.includes(permission);
  const none = Promise.resolve({ data: null });

  const [{ data: me }, leads, quotes, bugs, replies, integrators, licenses, accounts] = await Promise.all([
    supabase.from("profiles").select("notifications_seen_at").eq("id", userId).maybeSingle(),
    sees("leads.manage") ? supabase.from("leads").select("id, name, email, company, type, created_at").order("created_at", { ascending: false }).limit(limit) : none,
    sees("leads.manage") ? supabase.from("quote_requests").select("id, reference, contact_name, company, created_at").order("created_at", { ascending: false }).limit(limit) : none,
    sees("leads.manage") ? supabase.from("bug_reports").select("id, reference, title, severity, created_at").order("created_at", { ascending: false }).limit(limit) : none,
    sees("leads.manage")
      ? supabase
          .from("bug_report_messages")
          .select("id, report_id, created_at, author:profiles!bug_report_messages_author_id_fkey(full_name, user_type), report:bug_reports!bug_report_messages_report_id_fkey(reference, title)")
          .eq("is_internal", false)
          .order("created_at", { ascending: false })
          .limit(limit)
      : none,
    sees("content.manage") ? supabase.from("integrators").select("id, company_name, country, created_at").eq("status", "pending").order("created_at", { ascending: false }).limit(limit) : none,
    sees("licenses.manage")
      ? supabase.from("licenses").select("id, label, created_at, owner:profiles!licenses_owner_id_fkey(full_name, company)").eq("status", "pending").order("created_at", { ascending: false }).limit(limit)
      : none,
    sees("users.manage") ? supabase.from("profiles").select("id, full_name, email, company, created_at").eq("user_type", "external").order("created_at", { ascending: false }).limit(limit) : none,
  ]);

  const seenAt = me?.notifications_seen_at ?? new Date(0).toISOString();
  const item = (id: string, kind: NotificationKind, title: string, detail: string | null, to: string, createdAt: string): NotificationItem => ({
    id,
    kind,
    title,
    detail,
    to,
    createdAt,
    unread: createdAt > seenAt,
  });

  const items: NotificationItem[] = [
    ...(leads.data ?? []).map((row) => item(`lead-${row.id}`, "lead", row.company || row.name || row.email, `New ${row.type ?? "contact"} enquiry`, "/sales/leads", row.created_at)),
    ...(quotes.data ?? []).map((row) => item(`quote-${row.id}`, "quote", row.company || row.contact_name, `Quote request ${row.reference}`, "/sales/quote-requests", row.created_at)),
    ...(bugs.data ?? []).map((row) => item(`bug-${row.id}`, "bug", row.title, `${row.reference} · ${row.severity}`, "/community/bug-reports", row.created_at)),
    ...(replies.data ?? []).flatMap((row) => {
      const author = row.author as unknown as { full_name: string | null; user_type: string } | null;
      const report = row.report as unknown as { reference: string; title: string } | null;
      if (author?.user_type === "internal") return [];
      return [item(`reply-${row.id}`, "reply", `${author?.full_name ?? "The reporter"} replied`, report ? `${report.reference} · ${report.title}` : null, "/community/bug-reports", row.created_at)];
    }),
    ...(licenses.data ?? []).map((row) => {
      const owner = row.owner as unknown as { full_name: string | null; company: string | null } | null;
      return item(`license-${row.id}`, "license", row.label, `Licence request${owner?.company || owner?.full_name ? ` · ${owner.company || owner.full_name}` : ""}`, "/licensing/licences", row.created_at);
    }),
    ...(accounts.data ?? []).map((row) => item(`account-${row.id}`, "account", row.full_name || row.email || "New account", `New account${row.company ? ` · ${row.company}` : ""}`, "/system/users", row.created_at)),
    ...(integrators.data ?? []).map((row) => item(`integrator-${row.id}`, "integrator", row.company_name, `Directory application${row.country ? ` · ${row.country}` : ""}`, "/community/integrators", row.created_at)),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return { items: items.slice(0, limit), unread: items.filter((entry) => entry.unread).length };
}

export async function markNotificationsSeen(userId: string) {
  const { error } = await supabase.from("profiles").update({ notifications_seen_at: new Date().toISOString() }).eq("id", userId);
  if (error) throw error;
}
