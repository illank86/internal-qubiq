import { createBrowserRouter } from "react-router";
import { RequireStaff } from "@/components/app-shell";
import { ComingSoonPage, NotFoundPage } from "@/pages/coming-soon";
import { DashboardPage } from "@/pages/dashboard";
import { ForgotPasswordPage } from "@/pages/forgot-password";
import { LoginPage } from "@/pages/login";
import { SetPasswordPage } from "@/pages/set-password";
import { NAV_ITEMS } from "@/nav";
import { QuotationBuilderPage } from "@/features/sales/quotation-builder-page";
import { QuotationsPage } from "@/features/sales/quotations-page";
import { ConvertPage } from "@/features/sales/convert-page";
import { CustomerPage } from "@/features/sales/customer-page";
import { InvoicesPage } from "@/features/sales/invoices-page";
import { BugReportsPage } from "@/features/community/bug-reports-page";
import { IntegratorsPage } from "@/features/community/integrators-page";
import { LicencesPage } from "@/features/licensing/licences-page";
import { EditionsPage } from "@/features/sales/editions-page";
import { LeadsPage } from "@/features/sales/leads-page";
import { SalesSettingsPage } from "@/features/sales/settings-page";
import { QuoteRequestsPage } from "@/features/sales/quote-requests-page";

/** Screens built here; everything else in the menu is still a placeholder. */
const READY: Record<string, React.ReactNode> = {
  "/sales/quotations": <QuotationsPage />,
  "/sales/invoices": <InvoicesPage />,
  "/sales/quote-requests": <QuoteRequestsPage />,
  "/sales/leads": <LeadsPage />,
  "/sales/editions": <EditionsPage />,
  "/sales/settings": <SalesSettingsPage />,
  "/licensing/licences": <LicencesPage />,
  "/community/bug-reports": <BugReportsPage />,
  "/community/integrators": <IntegratorsPage />,
};

/**
 * Signed-out screens: sign in, forgot password, set password (invite and
 * reset links). No sign-up — staff are invited.
 *
 * Everything else is behind <RequireStaff>. Screens still on the website's
 * admin render a placeholder that links there.
 */
export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/forgot-password", element: <ForgotPasswordPage /> },
  { path: "/set-password", element: <SetPasswordPage /> },
  {
    element: <RequireStaff />,
    children: [
      { index: true, element: <DashboardPage /> },
      ...NAV_ITEMS.map((item) => ({ path: item.path, element: READY[item.path] ?? <ComingSoonPage item={item} /> })),
      { path: "/sales/quotations/new", element: <QuotationBuilderPage /> },
      { path: "/sales/quotations/:id/edit", element: <QuotationBuilderPage /> },
      { path: "/sales/quotations/:id/convert", element: <ConvertPage /> },
      { path: "/sales/quotations/:id/customer", element: <CustomerPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
