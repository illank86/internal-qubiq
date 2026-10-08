import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import { Button, Divider, Flex, Input, Popover, Segmented, Tooltip, theme } from "antd";
import {
  BoldOutlined,
  CodeOutlined,
  ItalicOutlined,
  LinkOutlined,
  OrderedListOutlined,
  PictureOutlined,
  RedoOutlined,
  StrikethroughOutlined,
  TableOutlined,
  UndoOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import { siteAsset } from "@/lib/env";
import { htmlToMarkdown, markdownToHtml } from "@/lib/markdown-html";
import { MediaPicker } from "./media-picker";

/**
 * Images keep the path they were saved with — the website's own files are
 * site paths ("/illustrations/…") — but are drawn from the website, where
 * those paths load. Only the picture on screen changes, never the Markdown.
 */
const SiteImage = Image.extend({
  addNodeView() {
    return ({ node }) => {
      const image = document.createElement("img");
      const draw = (attrs: Record<string, unknown>) => {
        image.src = siteAsset(String(attrs.src ?? "")) ?? "";
        image.alt = String(attrs.alt ?? "");
        if (attrs.title) image.title = String(attrs.title);
        else image.removeAttribute("title");
      };
      draw(node.attrs);
      return {
        dom: image,
        update: (next) => {
          if (next.type !== node.type) return false;
          draw(next.attrs);
          return true;
        },
      };
    };
  },
});

/**
 * A WYSIWYG editor that stores Markdown — the same format the website's
 * fields hold and render. Bold, italic, headings, lists, links, images from
 * the media library and tables; "Markdown" shows the source for anything the
 * toolbar does not cover.
 */
export function RichTextField({ value, onChange, rows = 12 }: { value?: string | null; onChange?: (value: string | null) => void; rows?: number }) {
  const [mode, setMode] = useState<"visual" | "markdown">("visual");
  const [picker, setPicker] = useState(false);
  const { token } = theme.useToken();
  // The Markdown last written by the editor itself, so an echo of it does not reset the document.
  const written = useRef<string | null>(value ?? null);

  const editor = useEditor({
    extensions: [StarterKit.configure({ link: { openOnClick: false } }), SiteImage, TableKit],
    content: markdownToHtml(value ?? ""),
    immediatelyRender: true,
    editorProps: { attributes: { class: "qubiq-rich-text" } },
    onUpdate: ({ editor: current }) => {
      const markdown = htmlToMarkdown(current.getHTML()).trim();
      written.current = markdown || null;
      onChange?.(markdown || null);
    },
  });

  // A value set from outside (a reset, the Markdown tab) replaces the document.
  useEffect(() => {
    if (!editor || (value ?? null) === written.current) return;
    written.current = value ?? null;
    editor.commands.setContent(markdownToHtml(value ?? ""), { emitUpdate: false });
  }, [editor, value]);

  const minHeight = rows * 22;
  return (
    <div style={{ border: `1px solid ${token.colorBorder}`, borderRadius: token.borderRadius, overflow: "hidden" }}>
      <Flex align="center" justify="space-between" gap={8} wrap style={{ padding: "4px 6px", borderBottom: `1px solid ${token.colorBorderSecondary}`, background: token.colorFillQuaternary }}>
        {mode === "visual" && editor ? <Toolbar editor={editor} onImage={() => setPicker(true)} /> : <span />}
        <Segmented size="small" value={mode} onChange={(next) => setMode(next as typeof mode)} options={[{ value: "visual", label: "Visual" }, { value: "markdown", label: "Markdown" }]} />
      </Flex>
      {mode === "visual" ? (
        <div style={{ minHeight, maxHeight: 640, overflowY: "auto", padding: "8px 14px" }}>
          <EditorContent editor={editor} />
        </div>
      ) : (
        <Input.TextArea
          variant="borderless"
          value={value ?? ""}
          onChange={(event) => onChange?.(event.target.value || null)}
          autoSize={{ minRows: rows, maxRows: 30 }}
          style={{ fontFamily: "Geist Mono, monospace", fontSize: 13, padding: "8px 14px" }}
        />
      )}
      <MediaPicker open={picker} accept="image" onClose={() => setPicker(false)} onPick={(asset) => editor?.chain().focus().setImage({ src: asset.url, alt: asset.alt ?? "" }).run()} />
    </div>
  );
}

function Toolbar({ editor, onImage }: { editor: Editor; onImage: () => void }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive("bold"),
      italic: current.isActive("italic"),
      strike: current.isActive("strike"),
      code: current.isActive("code"),
      h2: current.isActive("heading", { level: 2 }),
      h3: current.isActive("heading", { level: 3 }),
      bullet: current.isActive("bulletList"),
      ordered: current.isActive("orderedList"),
      quote: current.isActive("blockquote"),
      link: current.isActive("link"),
      href: (current.getAttributes("link").href as string | undefined) ?? "",
    }),
  });
  const [href, setHref] = useState("");

  const tool = (title: string, icon: React.ReactNode, active: boolean, run: () => void) => (
    <Tooltip title={title} key={title}>
      <Button size="small" type={active ? "primary" : "text"} icon={icon} onClick={run} aria-label={title} aria-pressed={active} />
    </Tooltip>
  );
  const text = (title: string, label: string, active: boolean, run: () => void) => (
    <Tooltip title={title} key={title}>
      <Button size="small" type={active ? "primary" : "text"} onClick={run} aria-label={title} aria-pressed={active} style={{ fontWeight: 600, paddingInline: 6 }}>
        {label}
      </Button>
    </Tooltip>
  );
  const chain = () => editor.chain().focus();

  return (
    <Flex align="center" gap={2} wrap>
      {text("Heading", "H2", state.h2, () => chain().toggleHeading({ level: 2 }).run())}
      {text("Subheading", "H3", state.h3, () => chain().toggleHeading({ level: 3 }).run())}
      <Divider orientation="vertical" />
      {tool("Bold", <BoldOutlined />, state.bold, () => chain().toggleBold().run())}
      {tool("Italic", <ItalicOutlined />, state.italic, () => chain().toggleItalic().run())}
      {tool("Strikethrough", <StrikethroughOutlined />, state.strike, () => chain().toggleStrike().run())}
      {tool("Code", <CodeOutlined />, state.code, () => chain().toggleCode().run())}
      <Divider orientation="vertical" />
      {tool("Bulleted list", <UnorderedListOutlined />, state.bullet, () => chain().toggleBulletList().run())}
      {tool("Numbered list", <OrderedListOutlined />, state.ordered, () => chain().toggleOrderedList().run())}
      {text("Quote", "“", state.quote, () => chain().toggleBlockquote().run())}
      <Divider orientation="vertical" />
      <Popover
        trigger="click"
        onOpenChange={(open) => open && setHref(state.href)}
        content={
          <Flex gap={6}>
            <Input size="small" placeholder="https://…" value={href} onChange={(event) => setHref(event.target.value)} style={{ width: 240 }} />
            <Button size="small" type="primary" onClick={() => (href ? chain().extendMarkRange("link").setLink({ href }).run() : chain().extendMarkRange("link").unsetLink().run())}>
              {href ? "Set" : "Remove"}
            </Button>
          </Flex>
        }
      >
        <Tooltip title="Link">
          <Button size="small" type={state.link ? "primary" : "text"} icon={<LinkOutlined />} aria-label="Link" />
        </Tooltip>
      </Popover>
      {tool("Image from the media library", <PictureOutlined />, false, onImage)}
      {tool("Table", <TableOutlined />, false, () => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}
      <Divider orientation="vertical" />
      {tool("Undo", <UndoOutlined />, false, () => chain().undo().run())}
      {tool("Redo", <RedoOutlined />, false, () => chain().redo().run())}
    </Flex>
  );
}
