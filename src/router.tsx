import { createBrowserRouter } from "react-router";
import { RequireStaff } from "@/components/app-shell";
import { ComingSoonPage, NotFoundPage } from "@/pages/coming-soon";
import { DashboardPage } from "@/pages/dashboard";
import { ForgotPasswordPage } from "@/pages/forgot-password";
import { LoginPage } from "@/pages/login";
import { SetPasswordPage } from "@/pages/set-password";
import { NAV_ITEMS } from "@/nav";

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
      ...NAV_ITEMS.map((item) => ({ path: item.path, element: <ComingSoonPage item={item} /> })),
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
