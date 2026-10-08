import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import remarkStringify from "remark-stringify";
import rehypeParse from "rehype-parse";
import rehypeRemark from "rehype-remark";
import rehypeStringify from "rehype-stringify";

/**
 * Markdown ↔ HTML, for the rich-text editor in /admin.
 *
 * The database stores markdown and the public site renders it with
 * `react-markdown` + `remark-gfm` (see components/primitives/prose.tsx). A
 * WYSIWYG editor works in HTML, so something has to translate in both
 * directions — and the thing that translates has to agree with the renderer
 * about what the markdown means, or the editor shows one document and the site
 * publishes another.
 *
 * So this uses remark, the same parser `react-markdown` is built on, rather
 * than bolting a second markdown dialect (markdown-it via `tiptap-markdown`,
 * or `turndown`) onto the project. Those were the obvious picks and both were
 * rejected on maintenance: `tiptap-markdown` last shipped in Sept 2025 and
 * `turndown-plugin-gfm` — which is what gives `turndown` its table support —
 * last shipped in 2018. remark, remark-gfm and rehype-remark are all current
 * and already in this dependency tree.
 *
 * Both directions are synchronous. Every plugin in both pipelines is a sync
 * transform, so `processSync` is safe, and a sync API is what lets the editor
 * convert on save without the field having to model a pending state.
 */

/**
 * Stringifier settings chosen to match the markdown already in the database,
 * so opening a post in the editor and saving it without touching anything
 * produces no diff. The content uses `-` bullets, `**strong**`, `*emphasis*`
 * and `---` rules; remark's defaults would rewrite the first three.
 */
const STRINGIFY_OPTIONS = {
  bullet: "-",
  emphasis: "*",
  strong: "*",
  rule: "-",
  fences: true,
  listItemIndent: "one",
} as const;

/**
 * Table formatting is left at remark's default, which pads every cell out to
 * its column width.
 *
 * The alternative, `tablePipeAlign: false`, was tried and reverted. It writes
 * the narrowest legal table, which turns a delimiter row of `| --- | --- |`
 * into `| - | - |` — valid GFM, parsed identically, and unlike anything a
 * person would type. Since the source view exists to be read and edited by
 * hand, the padded form is the better of the two, even though it means one
 * reformat the first time a document containing a table is saved.
 */

type MdastNode = { type: string; spread?: boolean; children?: MdastNode[] };

/**
 * Marks lists tight when nothing in them needs a blank line.
 *
 * This is not cosmetic, and without it the editor would quietly restyle the
 * site. TipTap's schema wraps every list item's text in a paragraph — its
 * HTML for a bullet is always `<li><p>One</p></li>`, never `<li>One</li>` —
 * and `rehype-remark` reads a paragraph inside an item as "this item is
 * spread", which `remark-stringify` then writes with blank lines between the
 * items. Markdown treats such a list as loose and wraps every item in `<p>` on
 * output, so the published page gains a paragraph's margin between every
 * bullet. One save on an untouched post would do it.
 *
 * An item that genuinely holds two paragraphs, or a code block, HAS to stay
 * loose to survive the trip, so only lists whose items are a single paragraph
 * plus optional nested lists are tightened.
 */
function tightenLists() {
  const canBeTight = (item: MdastNode) => {
    const children = item.children ?? [];
    if (children.length === 0) return true;
    if (children[0]?.type !== "paragraph") return false;
    return children.slice(1).every((child) => child.type === "list");
  };

  const walk = (node: MdastNode) => {
    for (const child of node.children ?? []) walk(child);

    if (node.type !== "list") return;
    const items = (node.children ?? []).filter((child) => child.type === "listItem");
    if (!items.every(canBeTight)) return;

    node.spread = false;
    for (const item of items) item.spread = false;
  };

  return (tree: MdastNode) => walk(tree);
}

const toHtml = unified()
  .use(remarkParse)
  .use(remarkGfm)
  // No `allowDangerousHtml`. Raw HTML in a markdown body would survive the trip
  // out but not the trip back — the editor's schema has no node for it, so it
  // would be silently dropped on the next save. Dropping it on the way IN is
  // the same loss made visible, before anyone has typed a paragraph on top of
  // it. Nothing in the CMS uses raw HTML today.
  .use(remarkRehype)
  .use(rehypeStringify)
  .freeze();

const toMarkdown = unified()
  .use(rehypeParse, { fragment: true })
  .use(rehypeRemark)
  .use(tightenLists)
  .use(remarkGfm)
  .use(remarkStringify, STRINGIFY_OPTIONS)
  .freeze();

/** Markdown from the database to HTML the editor can load. */
export function markdownToHtml(markdown: string): string {
  if (!markdown.trim()) return "";
  return String(toHtml.processSync(markdown));
}

/** HTML from the editor back to the markdown the column stores. */
export function htmlToMarkdown(html: string): string {
  if (!html.trim()) return "";

  // TipTap represents an empty document as a single empty paragraph. Left
  // alone that round-trips to "<br />" and then to a body that is not empty but
  // renders as nothing, which is worse than a null column.
  if (html === "<p></p>" || html === "<p><br></p>") return "";

  return String(toMarkdown.processSync(html)).trim();
}
