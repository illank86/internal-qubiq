import {
  BarChart3,
  BookOpen,
  Bug,
  FileSignature,
  FileText,
  Globe,
  Handshake,
  Image,
  Inbox,
  KeyRound,
  LayoutList,
  type LucideIcon,
  Mail,
  Megaphone,
  Navigation,
  Package,
  Receipt,
  ScrollText,
  Settings2,
  ShieldCheck,
  Sparkles,
  Tags,
  Users,
} from "lucide-react";
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
  icon: LucideIcon;
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
      { path: "/sales/quote-requests", label: "Quote requests", icon: Inbox, permissions: ["leads.manage"], legacy: "/admin/quote_requests", phase: 3, summary: "Requests from the pricing page, ready to turn into quotations." },
      { path: "/sales/quotations", label: "Quotations", icon: FileSignature, permissions: ["leads.manage"], legacy: "/admin/quotations", phase: 3, summary: "Build, send and track quotations with server groups; claim links and customer accounts." },
      { path: "/sales/invoices", label: "Invoices", icon: Receipt, permissions: ["licenses.manage"], legacy: "/admin/invoices", phase: 3, summary: "Invoices converted from accepted quotations: payment status, corrections, PDFs." },
      { path: "/sales/leads", label: "Leads", icon: Handshake, permissions: ["leads.manage"], legacy: "/admin/leads", phase: 3, summary: "Contact-form enquiries and their follow-up." },
      { path: "/sales/editions", label: "Editions & modules", icon: Package, permissions: ["pricing.manage"], legacy: "/admin/license_modules", phase: 3, summary: "The price list: modules, categories and the editions built from them." },
      { path: "/sales/settings", label: "Sales settings", icon: Settings2, permissions: ["licenses.manage"], legacy: "/admin/invoice_settings", phase: 3, summary: "Tax, payment terms, how to pay, quotation wording." },
    ],
  },
  {
    heading: "Licensing",
    items: [
      { path: "/licensing/licences", label: "Licences", icon: KeyRound, permissions: ["licenses.manage"], legacy: "/admin/licenses", phase: 4, summary: "Fingerprint requests: issue .qlf files, revoke, link to orders." },
    ],
  },
  {
    heading: "Community",
    items: [
      { path: "/community/bug-reports", label: "Bug reports", icon: Bug, permissions: ["content.manage"], legacy: "/admin/bug_reports", phase: 4, summary: "Triage customer reports and reply to them." },
      { path: "/community/integrators", label: "Integrators", icon: Globe, permissions: ["content.manage"], legacy: "/admin/integrators", phase: 4, summary: "Review directory applications and listings." },
    ],
  },
  {
    heading: "Content",
    items: [
      { path: "/content/pages", label: "Pages", icon: FileText, permissions: ["content.manage"], legacy: "/admin/pages", phase: 2, summary: "Website pages and their sections." },
      { path: "/content/navigation", label: "Navigation", icon: Navigation, permissions: ["content.manage"], legacy: "/admin/navigation_items", phase: 2, summary: "Header and footer menus." },
      { path: "/content/features", label: "Features", icon: Sparkles, permissions: ["content.manage"], legacy: "/admin/features", phase: 2, summary: "Features, categories and use cases." },
      { path: "/content/marketing", label: "Proof & FAQs", icon: LayoutList, permissions: ["content.manage"], legacy: "/admin/testimonials", phase: 2, summary: "Testimonials, logos, stats, FAQs and videos." },
      { path: "/content/media", label: "Media library", icon: Image, permissions: ["content.manage"], legacy: "/admin/media_assets", phase: 2, summary: "Images and files used across the website." },
      { path: "/content/releases", label: "Releases", icon: Package, permissions: ["downloads.manage"], legacy: "/admin/releases", phase: 2, summary: "Product releases, download files and system requirements." },
      { path: "/content/site", label: "Site settings", icon: Settings2, permissions: ["content.manage"], legacy: "/admin/site_settings", phase: 2, summary: "Company details, contact addresses and site-wide settings." },
    ],
  },
  {
    heading: "Blog",
    items: [
      { path: "/blog/posts", label: "Posts", icon: BookOpen, permissions: ["blog.manage"], legacy: "/admin/blog_posts", phase: 2, summary: "Write and publish blog posts." },
      { path: "/blog/taxonomy", label: "Categories & tags", icon: Tags, permissions: ["blog.manage"], legacy: "/admin/blog_categories", phase: 2, summary: "How posts are grouped." },
    ],
  },
  {
    heading: "Marketing",
    items: [
      { path: "/marketing/newsletters", label: "Newsletters", icon: Megaphone, permissions: ["content.manage"], legacy: "/admin/newsletter_issues", phase: 5, summary: "Compose, test and send newsletters." },
      { path: "/marketing/subscribers", label: "Subscribers", icon: Mail, permissions: ["content.manage"], legacy: "/admin/newsletter_subscribers", phase: 5, summary: "Who receives the newsletter." },
    ],
  },
  {
    heading: "System",
    items: [
      { path: "/system/users", label: "Users & roles", icon: Users, permissions: ["users.manage"], legacy: "/admin/users", phase: 5, summary: "Invite staff and give them roles." },
      { path: "/system/activity", label: "Activity log", icon: ShieldCheck, permissions: ["users.manage"], legacy: "/admin/activity", phase: 5, summary: "Who changed what, and when." },
      { path: "/system/notifications", label: "Email log", icon: ScrollText, permissions: ["users.manage", "content.manage"], legacy: "/admin/notification_log", phase: 5, summary: "Every email the site has sent, and why one failed." },
      { path: "/system/downloads", label: "Download analytics", icon: BarChart3, permissions: ["downloads.manage"], legacy: "/admin/downloads", phase: 5, summary: "Who downloads what, from where." },
    ],
  },
];

export const NAV_ITEMS = NAV.flatMap((group) => group.items);
