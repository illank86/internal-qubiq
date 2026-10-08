import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router";
import { AuthProvider } from "@/auth/auth-provider";
import { PdfViewerProvider } from "@/components/pdf-viewer";
import { router } from "@/router";
import { ThemeProvider } from "@/theme-provider";
import { reloadForUpdate } from "@/components/route-error";
import "./index.css";

// A deploy replaced the page files this tab was loaded with: reload once for the new build.
window.addEventListener("vite:preloadError", (event) => {
  if (reloadForUpdate()) event.preventDefault();
});

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
          <PdfViewerProvider>
            <RouterProvider router={router} />
          </PdfViewerProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
