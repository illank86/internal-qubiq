import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router";
import { AuthProvider } from "@/auth/auth-provider";
import { router } from "@/router";
import { ThemeProvider } from "@/theme-provider";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    // Staff data changes under their feet (customers, other staff): refetch
    // on focus, but do not hammer the database on every remount.
    queries: { staleTime: 30_000, refetchOnWindowFocus: true, retry: 1 },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
