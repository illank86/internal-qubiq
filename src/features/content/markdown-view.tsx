import { useMemo } from "react";
import { markdownToHtml } from "@/lib/markdown-html";
import { siteAsset } from "@/lib/env";

const SAFE_URL = /^(https?:|mailto:|#|\/)/i;

/**
 * Markdown shown formatted — read-only, for text people outside the team
 * wrote (bug reports). The converter already drops raw HTML; links and images
 * are kept only when they point somewhere safe, so a `javascript:` link in a
 * report cannot run in a staff member's session.
 */
export function MarkdownView({ markdown }: { markdown: string | null | undefined }) {
  const html = useMemo(() => {
    const raw = markdownToHtml(markdown ?? "");
    if (!raw) return "";
    const doc = new DOMParser().parseFromString(`<div>${raw}</div>`, "text/html");
    for (const link of doc.querySelectorAll("a")) {
      const href = link.getAttribute("href") ?? "";
      if (!SAFE_URL.test(href.trim())) link.removeAttribute("href");
      link.setAttribute("target", "_blank");
      link.setAttribute("rel", "noopener noreferrer");
    }
    for (const image of doc.querySelectorAll("img")) {
      const src = siteAsset((image.getAttribute("src") ?? "").trim()) ?? "";
      if (/^https?:/i.test(src)) image.setAttribute("src", src);
      else image.remove();
    }
    return doc.body.firstElementChild?.innerHTML ?? "";
  }, [markdown]);

  if (!html) return null;
  return <div className="qubiq-rich-text" dangerouslySetInnerHTML={{ __html: html }} />;
}
