import type { ComponentType } from "react";
import {
  AppstoreOutlined,
  AuditOutlined,
  BarChartOutlined,
  BookOutlined,
  BugOutlined,
  CloudDownloadOutlined,
  ContactsOutlined,
  FileDoneOutlined,
  FileImageOutlined,
  FileTextOutlined,
  GlobalOutlined,
  InboxOutlined,
  KeyOutlined,
  MailOutlined,
  MenuOutlined,
  NotificationOutlined,
  ProfileOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  StarOutlined,
  TagsOutlined,
  TeamOutlined,
  TransactionOutlined,
} from "@ant-design/icons";
import type { AppPermission } from "@/lib/types";

/**
 * Everything staff do, grouped as in the plan to move them off the website.
 *
 * `legacy` is where the screen lives today, in the website's /admin; until a
 * page is built here (`ready: true`) its placeholder links there. `phase` is
 * the migration phase that brings it over.
 */
export type NavItem = {
  path: string;
  label: string;
  icon: ComponentType;
  /** Any of these permissions shows the item. */
  permissions: AppPermission[];
  legacy: string;
  phase: number;
  ready?: boolean;
  summary: string;
};

export type NavGroup = { heading: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  {
    heading: "Sales",
    items: [
      { path: "/sales/quote-requests", label: "Quote requests", icon: InboxOutlined, permissions: ["leads.manage"], legacy: "/admin/quote_requests", phase: 3, ready: true, summary: "Requests from the pricing page, ready to turn into quotations." },
      { path: "/sales/quotations", label: "Quotations", icon: FileDoneOutlined, permissions: ["leads.manage"], legacy: "/admin/quotations", phase: 3, ready: true, summary: "Build, send and track quotations with server groups; claim links and customer accounts." },
      { path: "/sales/invoices", label: "Invoices", icon: TransactionOutlined, permissions: ["licenses.manage"], legacy: "/admin/invoices", phase: 3, ready: true, summary: "Invoices converted from accepted quotations: payment status, corrections, PDFs." },
      { path: "/sales/leads", label: "Leads", icon: ContactsOutlined, permissions: ["leads.manage"], legacy: "/admin/leads", phase: 3, ready: true, summary: "Contact-form enquiries and their follow-up." },
      { path: "/sales/editions", label: "Editions & modules", icon: AppstoreOutlined, permissions: ["pricing.manage"], legacy: "/admin/license_modules", phase: 3, ready: true, summary: "The price list: modules, categories and the editions built from them." },
      { path: "/sales/settings", label: "Sales settings", icon: SettingOutlined, permissions: ["licenses.manage"], legacy: "/admin/invoice_settings", phase: 3, ready: true, summary: "Tax, payment terms, how to pay, quotation wording." },
    ],
  },
  {
    heading: "Licensing",
    items: [
      { path: "/licensing/licences", label: "Licences", icon: KeyOutlined, permissions: ["licenses.manage"], legacy: "/admin/licenses", phase: 4, ready: true, summary: "Fingerprint requests: issue .qlf files, revoke, link to orders." },
    ],
  },
  {
    heading: "Community",
    items: [
      { path: "/community/bug-reports", label: "Bug reports", icon: BugOutlined, permissions: ["leads.manage"], legacy: "/admin/bug_reports", phase: 4, ready: true, summary: "Triage customer reports and reply to them." },
      { path: "/community/integrators", label: "Integrators", icon: GlobalOutlined, permissions: ["content.manage"], legacy: "/admin/integrators", phase: 4, ready: true, summary: "Review directory applications and listings." },
    ],
  },
  {
    heading: "Content",
    items: [
      { path: "/content/pages", label: "Pages", icon: FileTextOutlined, permissions: ["content.manage"], legacy: "/admin/pages", phase: 2, ready: true, summary: "Website pages and their sections." },
      { path: "/content/navigation", label: "Navigation", icon: MenuOutlined, permissions: ["content.manage"], legacy: "/admin/navigation_items", phase: 2, ready: true, summary: "Header and footer menus." },
      { path: "/content/features", label: "Features", icon: StarOutlined, permissions: ["content.manage"], legacy: "/admin/features", phase: 2, ready: true, summary: "Features, categories and use cases." },
      { path: "/content/marketing", label: "Proof & FAQs", icon: ProfileOutlined, permissions: ["content.manage"], legacy: "/admin/testimonials", phase: 2, ready: true, summary: "Testimonials, logos, stats, FAQs and videos." },
      { path: "/content/media", label: "Media library", icon: FileImageOutlined, permissions: ["content.manage"], legacy: "/admin/media_assets", phase: 2, ready: true, summary: "Images and files used across the website." },
      { path: "/content/releases", label: "Releases", icon: CloudDownloadOutlined, permissions: ["downloads.manage"], legacy: "/admin/releases", phase: 2, ready: true, summary: "Product releases, download files and system requirements." },
      { path: "/content/site", label: "Site settings", icon: SettingOutlined, permissions: ["content.manage"], legacy: "/admin/site_settings", phase: 2, ready: true, summary: "Company details, contact addresses and site-wide settings." },
    ],
  },
  {
    heading: "Blog",
    items: [
      { path: "/blog/posts", label: "Posts", icon: BookOutlined, permissions: ["blog.manage"], legacy: "/admin/blog_posts", phase: 2, ready: true, summary: "Write and publish blog posts." },
      { path: "/blog/taxonomy", label: "Categories & tags", icon: TagsOutlined, permissions: ["blog.manage"], legacy: "/admin/blog_categories", phase: 2, ready: true, summary: "How posts are grouped." },
    ],
  },
  {
    heading: "Marketing",
    items: [
      { path: "/marketing/newsletters", label: "Newsletters", icon: NotificationOutlined, permissions: ["content.manage"], legacy: "/admin/newsletter_issues", phase: 5, summary: "Compose, test and send newsletters." },
      { path: "/marketing/subscribers", label: "Subscribers", icon: MailOutlined, permissions: ["content.manage"], legacy: "/admin/newsletter_subscribers", phase: 5, summary: "Who receives the newsletter." },
    ],
  },
  {
    heading: "System",
    items: [
      { path: "/system/users", label: "Users & roles", icon: TeamOutlined, permissions: ["users.manage"], legacy: "/admin/users", phase: 5, summary: "Invite staff and give them roles." },
      { path: "/system/activity", label: "Activity log", icon: AuditOutlined, permissions: ["users.manage"], legacy: "/admin/activity", phase: 5, summary: "Who changed what, and when." },
      { path: "/system/notifications", label: "Email log", icon: SafetyCertificateOutlined, permissions: ["users.manage", "content.manage"], legacy: "/admin/notification_log", phase: 5, summary: "Every email the site has sent, and why one failed." },
      { path: "/system/downloads", label: "Download analytics", icon: BarChartOutlined, permissions: ["downloads.manage"], legacy: "/admin/downloads", phase: 5, summary: "Who downloads what, from where." },
    ],
  },
];

export const NAV_ITEMS = NAV.flatMap((group) => group.items);
