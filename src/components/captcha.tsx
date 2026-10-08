import { useEffect, useRef, useState } from "react";
import { Typography } from "antd";

/**
 * Cloudflare Turnstile — Supabase Auth has captcha protection on, so every
 * sign-in and password-reset request must carry a token. The same widget as
 * the website; it usually stays invisible and only asks for a click when
 * Cloudflare is unsure.
 *
 * The widget's allowed hostnames (Cloudflare dashboard → Turnstile) must
 * include this app's address — localhost for development — or it fails with
 * "domain not authorised".
 */

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type Turnstile = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let scriptPromise: Promise<void> | null = null;
function loadScript() {
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("Turnstile failed to load"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/** Renders the widget and reports its token (empty until solved, and again after it expires). */
export function Captcha({ onToken, resetKey }: { onToken: (token: string) => void; resetKey?: unknown }) {
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const report = useRef(onToken);
  useEffect(() => {
    report.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (!SITE_KEY) return;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !container.current || !window.turnstile) return;
        widget.current = window.turnstile.render(container.current, {
          sitekey: SITE_KEY,
          appearance: "interaction-only",
          callback: (token: string) => {
            setFailed(null);
            report.current(token);
          },
          "expired-callback": () => report.current(""),
          "error-callback": (code: string) => {
            console.warn("[turnstile] error", code);
            report.current("");
            setFailed(
              String(code).startsWith("1102")
                ? `The security check is not set up for this address (error ${code}). Add it to the Turnstile widget's hostnames in Cloudflare.`
                : String(code).startsWith("1101")
                  ? `The security check's site key was refused (error ${code}).`
                  : `The security check could not load (error ${code}). Reload the page and try again.`,
            );
            return true;
          },
        });
      })
      .catch(() => setFailed("The security check could not load. Check your connection and reload."));
    return () => {
      cancelled = true;
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
  }, []);

  useEffect(() => {
    if (resetKey === undefined || !widget.current || !window.turnstile) return;
    window.turnstile.reset(widget.current);
  }, [resetKey]);

  if (!SITE_KEY) return null;
  return (
    <>
      <div ref={container} style={{ display: "flex", justifyContent: "center" }} />
      {failed ? (
        <Typography.Text type="danger" style={{ display: "block", fontSize: 12, marginBottom: 12 }}>
          {failed}
        </Typography.Text>
      ) : null}
    </>
  );
}
