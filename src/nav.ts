import type { ComponentType } from "react";
import {
  AppstoreOutlined,
  AuditOutlined,
  BarChartOutlined,
  BookOutlined,
  AccountBookOutlined,
  BugOutlined,
  FundOutlined,
  ReadOutlined,
  VerticalAlignBottomOutlined,
  VerticalAlignTopOutlined,
  CarOutlined,
  CloudDownloadOutlined,
  ContactsOutlined,
  CrownOutlined,
  FileDoneOutlined,
  FileImageOutlined,
  FileTextOutlined,
  ToolOutlined,
  InboxOutlined,
  KeyOutlined,
  MailOutlined,
  MenuOutlined,
  NotificationOutlined,
  PartitionOutlined,
  ProfileOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  StarOutlined,
  TagsOutlined,
  LaptopOutlined,
  SolutionOutlined,
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
      { path: "/sales/orders", label: "Order overview", icon: PartitionOutlined, permissions: ["quotations.manage", "accounting.manage", "licenses.manage"], legacy: "/admin/invoices", phase: 3, ready: true, summary: "One order from quote request to delivery: quotation, invoice, payment, delivery orders and licences." },
      { path: "/sales/leads", label: "Leads", icon: ContactsOutlined, permissions: ["leads.manage"], legacy: "/admin/leads", phase: 3, ready: true, summary: "Contact-form enquiries and their follow-up." },
      { path: "/sales/quote-requests", label: "Quote requests", icon: InboxOutlined, permissions: ["leads.manage"], legacy: "/admin/quote_requests", phase: 3, ready: true, summary: "Requests from the pricing page, ready to turn into quotations." },
      { path: "/sales/quotations", label: "Quotations", icon: FileDoneOutlined, permissions: ["quotations.manage"], legacy: "/admin/quotations", phase: 3, ready: true, summary: "Build, send and track quotations with server groups; claim links and customer accounts." },
      { path: "/licensing/licences", label: "Licences", icon: KeyOutlined, permissions: ["licenses.manage"], legacy: "/admin/licenses", phase: 4, ready: true, summary: "Fingerprint requests: issue .qlf files, revoke, link to orders." },
      { path: "/sales/delivery-orders", label: "Delivery Order", icon: CarOutlined, permissions: ["licenses.manage"], legacy: "/admin/invoices", phase: 3, ready: true, summary: "What was delivered for a paid invoice, and the customer's signed receipt and BAST." },
      { path: "/sales/editions", label: "Editions & modules", icon: AppstoreOutlined, permissions: ["pricing.manage"], legacy: "/admin/license_modules", phase: 3, ready: true, summary: "The price list: modules, categories and the editions built from them." },
      { path: "/sales/settings", label: "Sales settings", icon: SettingOutlined, permissions: ["quotations.manage", "licenses.manage", "users.manage"], legacy: "/admin/invoice_settings", phase: 3, ready: true, summary: "Quotation wording and numbering, tier discounts, delivery order numbering, approvals and the signature." },
    ],
  },
  {
    heading: "Finance",
    items: [
      { path: "/finance", label: "Dashboard", icon: FundOutlined, permissions: ["accounting.manage"], legacy: "/admin", phase: 6, ready: true, summary: "Cash, money in and out, what customers owe, profit and estimated tax." },
      { path: "/sales/invoices", label: "Invoices", icon: TransactionOutlined, permissions: ["accounting.manage"], legacy: "/admin/invoices", phase: 3, ready: true, summary: "Invoices made from accepted quotations: approval, sending, payments, “faktur pajak”." },
      { path: "/finance/money-in", label: "Money in", icon: VerticalAlignBottomOutlined, permissions: ["accounting.manage"], legacy: "/admin", phase: 6, ready: true, summary: "Payments received: what arrived, tax withheld (“bukti potong”), charges." },
      { path: "/finance/money-out", label: "Money out", icon: VerticalAlignTopOutlined, permissions: ["accounting.manage"], legacy: "/admin", phase: 6, ready: true, summary: "Expenses, paid now or owed, with receipts." },
      { path: "/finance/payroll", label: "Payroll", icon: SolutionOutlined, permissions: ["accounting.manage"], legacy: "/admin", phase: 6, ready: true, summary: "Employees, monthly salaries with PPh 21 and BPJS, payslips." },
      { path: "/finance/assets", label: "Fixed assets", icon: LaptopOutlined, permissions: ["accounting.manage"], legacy: "/admin", phase: 6, ready: true, summary: "Equipment, vehicles and buildings, depreciated by the tax groups." },
      { path: "/finance/tax", label: "Tax", icon: AccountBookOutlined, permissions: ["accounting.manage"], legacy: "/admin", phase: 6, ready: true, summary: "Each tax month: what is due, what was paid, lists for Coretax." },
      { path: "/finance/annual-tax", label: "Annual tax return", icon: AuditOutlined, permissions: ["accounting.manage"], legacy: "/admin", phase: 6, ready: true, summary: "“SPT Tahunan PPh Badan”: fiscal corrections, the tax, PPh 29, next year's PPh 25." },
      { path: "/finance/reports", label: "Reports", icon: BarChartOutlined, permissions: ["accounting.manage"], legacy: "/admin", phase: 6, ready: true, summary: "Profit and loss, balance sheet, cash flow, ledger; closing months." },
      { path: "/finance/journal", label: "Journal", icon: ReadOutlined, permissions: ["accounting.manage"], legacy: "/admin", phase: 6, ready: true, summary: "Every booking, debit and credit." },
      { path: "/finance/settings", label: "Finance settings", icon: SettingOutlined, permissions: ["accounting.manage"], legacy: "/admin", phase: 6, ready: true, summary: "Company details, invoices and ways to pay, tax and PKP, chart of accounts, bank accounts, KMK rates." },
    ],
  },
  {
    heading: "Community",
    items: [
      { path: "/community/bug-reports", label: "Bug reports", icon: BugOutlined, permissions: ["leads.manage"], legacy: "/admin/bug_reports", phase: 4, ready: true, summary: "Triage customer reports and reply to them." },
      { path: "/community/integrators", label: "Integrators", icon: ToolOutlined, permissions: ["content.manage"], legacy: "/admin/integrators", phase: 4, ready: true, summary: "Review directory applications and listings." },
      { path: "/community/integrator-tiers", label: "Integrator tiers", icon: CrownOutlined, permissions: ["content.manage"], legacy: "/admin/integrators", phase: 4, ready: true, summary: "Tiers integrators are placed on, and each tier's partner discount on quotations." },
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
      { path: "/marketing/newsletters", label: "Newsletters", icon: NotificationOutlined, permissions: ["leads.manage"], legacy: "/admin/newsletter_issues", phase: 5, ready: true, summary: "Compose, test and send newsletters." },
      { path: "/marketing/subscribers", label: "Subscribers", icon: MailOutlined, permissions: ["leads.manage"], legacy: "/admin/newsletter_subscribers", phase: 5, ready: true, summary: "Who receives the newsletter." },
    ],
  },
  {
    heading: "System",
    items: [
      { path: "/system/users", label: "Users & roles", icon: TeamOutlined, permissions: ["users.manage"], legacy: "/admin/users", phase: 5, ready: true, summary: "Invite staff and give them roles." },
      { path: "/system/activity", label: "Activity log", icon: AuditOutlined, permissions: ["users.manage"], legacy: "/admin/activity", phase: 5, ready: true, summary: "Who changed what, and when." },
      { path: "/system/notifications", label: "Email log", icon: SafetyCertificateOutlined, permissions: ["leads.manage"], legacy: "/admin/notification_log", phase: 5, ready: true, summary: "Every email the site has sent, and why one failed." },
      { path: "/system/downloads", label: "Download analytics", icon: BarChartOutlined, permissions: ["downloads.manage"], legacy: "/admin/downloads", phase: 5, ready: true, summary: "Who downloads what, from where." },
    ],
  },
];

export const NAV_ITEMS = NAV.flatMap((group) => group.items);
