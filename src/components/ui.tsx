import { forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Buttons, fields and notices, styled as on the website. */

const BUTTON = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90",
  outline: "border border-border-strong bg-surface hover:bg-muted",
  ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
};

export function Button({
  variant = "primary",
  pending = false,
  className,
  children,
  disabled,
  ...props
}: React.ComponentProps<"button"> & { variant?: keyof typeof BUTTON; pending?: boolean }) {
  return (
    <button
      disabled={disabled || pending}
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-60 [&_svg]:size-4",
        BUTTON[variant],
        className,
      )}
      {...props}
    >
      {pending ? <Loader2 aria-hidden className="animate-spin" /> : null}
      {children}
    </button>
  );
}

export const Input = forwardRef<HTMLInputElement, React.ComponentProps<"input">>(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
        className,
      )}
      {...props}
    />
  );
});

export function Field({ label, htmlFor, hint, error, children }: { label: string; htmlFor: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? <p className="text-xs text-danger">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "success" | "error"; children: React.ReactNode }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-lg border px-4 py-3 text-sm",
        tone === "error" && "border-danger/30 bg-danger/5 text-danger",
        tone === "success" && "border-success/30 bg-success/5 text-success",
        tone === "info" && "border-border bg-muted/40 text-foreground",
      )}
    >
      {children}
    </p>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <img src="/qubiq-mark.svg" alt="" className="size-7" />
      <span className="text-sm font-semibold tracking-tight">
        QUBIQ <span className="font-normal text-muted-foreground">Internal</span>
      </span>
    </span>
  );
}

/** The frame every signed-out screen shares: sign in, forgot, set password. */
export function AuthCard({ title, intro, children }: { title: string; intro: React.ReactNode; children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center px-4 py-16">
      <div className="mx-auto flex w-full max-w-md flex-col gap-8">
        <div className="flex flex-col items-center gap-6 text-center">
          <Logo />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{intro}</p>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-lg shadow-black/5 sm:p-8">{children}</div>
      </div>
    </main>
  );
}

export function FullPageSpinner() {
  return (
    <div className="grid min-h-dvh place-items-center" aria-busy="true" aria-label="Loading">
      <Loader2 aria-hidden className="size-6 animate-spin text-muted-foreground" />
    </div>
  );
}
