import { useEffect, useState } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation } from "react-router";
import { LayoutDashboard, LogOut, Menu as MenuIcon, Moon, Sun, X } from "lucide-react";
import { useAuth, useCan, useStaff } from "@/auth/use-auth";
import { FullPageSpinner, Logo } from "@/components/ui";
import { cn } from "@/lib/utils";
import { NAV } from "@/nav";

/** Signed-in pages only; staff only (the auth provider signs anyone else out). */
export function RequireStaff() {
  const { state } = useAuth();
  const location = useLocation();
  if (state.status === "loading") return <FullPageSpinner />;
  if (state.status === "signed-out") return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <AppShell />;
}

function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem("theme", dark ? "dark" : "light");
    } catch {
      // Storage blocked: the choice lasts for this visit only.
    }
  }, [dark]);
  return (
    <button
      type="button"
      onClick={() => setDark(!dark)}
      aria-label={dark ? "Use light theme" : "Use dark theme"}
      className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      {dark ? <Sun aria-hidden className="size-4" /> : <Moon aria-hidden className="size-4" />}
    </button>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const can = useCan();
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
      isActive ? "bg-primary-soft font-medium text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
    );

  return (
    <nav aria-label="Main" className="flex flex-col gap-6 p-4">
      <NavLink to="/" end className={linkClass} onClick={onNavigate}>
        <LayoutDashboard aria-hidden className="size-4" />
        Dashboard
      </NavLink>
      {NAV.map((group) => {
        const items = group.items.filter((item) => item.permissions.some(can));
        if (items.length === 0) return null;
        return (
          <div key={group.heading} className="flex flex-col gap-1">
            <h2 className="px-3 pb-1 text-[0.6875rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">{group.heading}</h2>
            {items.map((item) => (
              <NavLink key={item.path} to={item.path} className={linkClass} onClick={onNavigate}>
                <item.icon aria-hidden className="size-4" />
                <span className="flex-1">{item.label}</span>
                {!item.ready ? <span className="text-[0.625rem] text-muted-foreground/70">soon</span> : null}
              </NavLink>
            ))}
          </div>
        );
      })}
    </nav>
  );
}

function AppShell() {
  const staff = useStaff();
  const { signOut } = useAuth();
  // The mobile drawer closes from its own links (onNavigate) and buttons.
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh overflow-y-auto border-r border-border bg-surface lg:block">
        <div className="flex h-16 items-center border-b border-border px-5">
          <Link to="/">
            <Logo />
          </Link>
        </div>
        <Sidebar />
      </aside>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 overflow-y-auto border-r border-border bg-surface">
            <div className="flex h-16 items-center justify-between border-b border-border px-5">
              <Logo />
              <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="grid size-9 place-items-center rounded-lg hover:bg-muted">
                <X aria-hidden className="size-4" />
              </button>
            </div>
            <Sidebar onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur-xl sm:px-6">
          <button type="button" aria-label="Open menu" onClick={() => setOpen(true)} className="grid size-9 place-items-center rounded-lg hover:bg-muted lg:hidden">
            <MenuIcon aria-hidden className="size-5" />
          </button>
          <span className="lg:hidden">
            <Logo />
          </span>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-right text-sm sm:block">
              <span className="block leading-tight font-medium">{staff.profile?.full_name || staff.email}</span>
              <span className="block text-xs leading-tight text-muted-foreground">{staff.roles.join(", ") || "staff"}</span>
            </span>
            <ThemeToggle />
            <button
              type="button"
              onClick={() => void signOut()}
              aria-label="Sign out"
              title="Sign out"
              className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <LogOut aria-hidden className="size-4" />
            </button>
          </div>
        </header>
        <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/** Page heading, left-aligned, as on the website's admin. */
export function PageTitle({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
