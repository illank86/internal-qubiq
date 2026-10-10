import { Suspense, lazy } from "react";
import { createBrowserRouter } from "react-router";
import { RouteError } from "@/components/route-error";
import { RequireStaff } from "@/components/app-shell";
import { ComingSoonPage, NotFoundPage } from "@/pages/coming-soon";
import { DashboardPage } from "@/pages/dashboard";
import { ForgotPasswordPage } from "@/pages/forgot-password";
import { LoginPage } from "@/pages/login";
import { SetPasswordPage } from "@/pages/set-password";
import { NAV_ITEMS } from "@/nav";
import { FullPageSpinner } from "@/components/ui";

/*
 * Each screen is its own download, fetched the first time it is opened: the
 * PDF renderer, the rich-text editor and the Markdown tools never weigh on
 * the sign-in or the dashboard.
 */
const ApprovePage = lazy(() => import("@/pages/approve").then((module) => ({ default: module.ApprovePage })));
const QuotationBuilderPage = lazy(() => import("@/features/sales/quotation-builder-page").then((module) => ({ default: module.QuotationBuilderPage })));
const QuotationsPage = lazy(() => import("@/features/sales/quotations-page").then((module) => ({ default: module.QuotationsPage })));
const ConvertPage = lazy(() => import("@/features/sales/convert-page").then((module) => ({ default: module.ConvertPage })));
const CustomerPage = lazy(() => import("@/features/sales/customer-page").then((module) => ({ default: module.CustomerPage })));
const DeliveryOrdersPage = lazy(() => import("@/features/sales/delivery-orders-page").then((module) => ({ default: module.DeliveryOrdersPage })));
const OrdersPage = lazy(() => import("@/features/sales/orders-page").then((module) => ({ default: module.OrdersPage })));
const FinanceDashboardPage = lazy(() => import("@/features/finance/dashboard-page").then((module) => ({ default: module.FinanceDashboardPage })));
const MoneyInPage = lazy(() => import("@/features/finance/money-in-page").then((module) => ({ default: module.MoneyInPage })));
const MoneyOutPage = lazy(() => import("@/features/finance/money-out-page").then((module) => ({ default: module.MoneyOutPage })));
const TaxPage = lazy(() => import("@/features/finance/tax-page").then((module) => ({ default: module.TaxPage })));
const ReportsPage = lazy(() => import("@/features/finance/reports-page").then((module) => ({ default: module.ReportsPage })));
const JournalPage = lazy(() => import("@/features/finance/journal-page").then((module) => ({ default: module.JournalPage })));
const LedgerBookPage = lazy(() => import("@/features/finance/ledger-book-page").then((module) => ({ default: module.LedgerBookPage })));
const StatementPage = lazy(() => import("@/features/finance/statement-page").then((module) => ({ default: module.StatementPage })));
const PayrollPage = lazy(() => import("@/features/finance/payroll-page").then((module) => ({ default: module.PayrollPage })));
const PayrollRunPage = lazy(() => import("@/features/finance/payroll-run-page").then((module) => ({ default: module.PayrollRunPage })));
const AssetsPage = lazy(() => import("@/features/finance/assets-page").then((module) => ({ default: module.AssetsPage })));
const FinanceSettingsPage = lazy(() => import("@/features/finance/settings-page").then((module) => ({ default: module.FinanceSettingsPage })));
const InvoicesPage = lazy(() => import("@/features/sales/invoices-page").then((module) => ({ default: module.InvoicesPage })));
const BugReportsPage = lazy(() => import("@/features/community/bug-reports-page").then((module) => ({ default: module.BugReportsPage })));
const ContentPage = lazy(() => import("@/features/content/content-page").then((module) => ({ default: module.ContentPage })));
const MediaLibraryPage = lazy(() => import("@/features/content/media-library-page").then((module) => ({ default: module.MediaLibraryPage })));
const IntegratorTiersPage = lazy(() => import("@/features/community/integrator-tiers-page").then((module) => ({ default: module.IntegratorTiersPage })));
const IntegratorsPage = lazy(() => import("@/features/community/integrators-page").then((module) => ({ default: module.IntegratorsPage })));
const LicencesPage = lazy(() => import("@/features/licensing/licences-page").then((module) => ({ default: module.LicencesPage })));
const EditionsPage = lazy(() => import("@/features/sales/editions-page").then((module) => ({ default: module.EditionsPage })));
const LeadsPage = lazy(() => import("@/features/sales/leads-page").then((module) => ({ default: module.LeadsPage })));
const SalesSettingsPage = lazy(() => import("@/features/sales/settings-page").then((module) => ({ default: module.SalesSettingsPage })));
const NewslettersPage = lazy(() => import("@/features/system/newsletters-page").then((module) => ({ default: module.NewslettersPage })));
const UsersPage = lazy(() => import("@/features/system/users-page").then((module) => ({ default: module.UsersPage })));
const ActivityPage = lazy(() => import("@/features/system/activity-page").then((module) => ({ default: module.ActivityPage })));
const ProfilePage = lazy(() => import("@/pages/profile").then((module) => ({ default: module.ProfilePage })));
const DownloadsPage = lazy(() => import("@/features/system/downloads-page").then((module) => ({ default: module.DownloadsPage })));
const QuoteRequestsPage = lazy(() => import("@/features/sales/quote-requests-page").then((module) => ({ default: module.QuoteRequestsPage })));

import { CONTENT_SCREENS } from "@/features/content/content-screens";

/** Screens built here; everything else in the menu is still a placeholder. */
const READY: Record<string, React.ReactNode> = {
  "/sales/quotations": <QuotationsPage />,
  "/sales/invoices": <InvoicesPage />,
  "/finance": <FinanceDashboardPage />,
  "/finance/money-in": <MoneyInPage />,
  "/finance/money-out": <MoneyOutPage />,
  "/finance/tax": <TaxPage />,
  "/finance/reports": <ReportsPage />,
  "/finance/journal": <JournalPage />,
  "/finance/payroll": <PayrollPage />,
  "/finance/assets": <AssetsPage />,
  "/finance/settings": <FinanceSettingsPage />,
  "/sales/delivery-orders": <DeliveryOrdersPage />,
  "/sales/orders": <OrdersPage />,
  "/sales/quote-requests": <QuoteRequestsPage />,
  "/sales/leads": <LeadsPage />,
  "/sales/editions": <EditionsPage />,
  "/sales/settings": <SalesSettingsPage />,
  "/licensing/licences": <LicencesPage />,
  "/community/bug-reports": <BugReportsPage />,
  "/community/integrators": <IntegratorsPage />,
  "/community/integrator-tiers": <IntegratorTiersPage />,
  "/content/media": <MediaLibraryPage />,
  "/marketing/newsletters": <NewslettersPage />,
  "/system/users": <UsersPage />,
  "/system/activity": <ActivityPage />,
  "/system/downloads": <DownloadsPage />,
  ...Object.fromEntries(Object.keys(CONTENT_SCREENS).map((path) => [path, <ContentPage key={path} path={path} />])),
};

/**
 * Signed-out screens: sign in, forgot password, set password (invite and
 * reset links). No sign-up — staff are invited.
 *
 * Everything else is behind <RequireStaff>. Screens still on the website's
 * admin render a placeholder that links there.
 */
export const router = createBrowserRouter([
  {
    // A failed route (most often a page file from before the last deploy)
    // shows something useful instead of the framework's developer message.
    errorElement: <RouteError />,
    children: [
      { path: "/login", element: <LoginPage /> },
      { path: "/forgot-password", element: <ForgotPasswordPage /> },
      { path: "/set-password", element: <SetPasswordPage /> },
      // Approve from the approval email: no sign-in, the approval PIN instead.
      {
        path: "/approve/:token",
        element: (
          <Suspense fallback={<FullPageSpinner />}>
            <ApprovePage />
          </Suspense>
        ),
      },
      {
        element: <RequireStaff />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: "/account", element: <ProfilePage /> },
          ...NAV_ITEMS.map((item) => ({ path: item.path, element: READY[item.path] ?? <ComingSoonPage item={item} /> })),
          { path: "/sales/quotations/new", element: <QuotationBuilderPage /> },
          { path: "/sales/quotations/:id/edit", element: <QuotationBuilderPage /> },
          { path: "/sales/quotations/:id/convert", element: <ConvertPage /> },
          { path: "/sales/quotations/:id/customer", element: <CustomerPage /> },
          { path: "/finance/journal/book", element: <LedgerBookPage /> },
          { path: "/finance/reports/statements", element: <StatementPage /> },
          { path: "/finance/payroll/:id", element: <PayrollRunPage /> },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);
