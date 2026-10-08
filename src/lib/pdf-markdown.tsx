import { Link, Text, View } from "@react-pdf/renderer";
import type { ComponentProps } from "react";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { ListItem, PhrasingContent, RootContent } from "mdast";

/**
 * Markdown from an admin rich-text field (e.g. "How to pay"), drawn with
 * react-pdf primitives.
 *
 * Parsed with remark + GFM, the same parser the editor and the public site
 * use, so what the admin sees in the editor is what prints. Covers what that
 * editor produces for short blocks: paragraphs, line breaks, bold, italic,
 * strikethrough, code, links, headings, lists, quotes and rules. Images and
 * tables have no place in a payment box and are skipped or flattened.
 *
 * A single newline inside a paragraph is kept as a line break, not folded
 * into a space as in HTML — bank details written one fact per line before
 * this field became rich text must keep printing that way.
 */

type Style = Exclude<ComponentProps<typeof View>["style"], unknown[] | undefined>;

const parser = unified().use(remarkParse).use(remarkGfm);

type Marks = { bold?: boolean; italic?: boolean; strike?: boolean };

function font({ bold, italic }: Marks) {
  if (bold && italic) return "Helvetica-BoldOblique";
  if (bold) return "Helvetica-Bold";
  if (italic) return "Helvetica-Oblique";
  return "Helvetica";
}

function Inline({ nodes, marks = {}, linkColor }: { nodes: PhrasingContent[]; marks?: Marks; linkColor: string }) {
  return (
    <>
      {nodes.map((node, index) => {
        const style = { fontFamily: font(marks), ...(marks.strike ? { textDecoration: "line-through" as const } : {}) };
        switch (node.type) {
          case "text":
            return (
              <Text key={index} style={style}>
                {node.value}
              </Text>
            );
          case "break":
            return <Text key={index}>{"\n"}</Text>;
          case "strong":
            return <Inline key={index} nodes={node.children} marks={{ ...marks, bold: true }} linkColor={linkColor} />;
          case "emphasis":
            return <Inline key={index} nodes={node.children} marks={{ ...marks, italic: true }} linkColor={linkColor} />;
          case "delete":
            return <Inline key={index} nodes={node.children} marks={{ ...marks, strike: true }} linkColor={linkColor} />;
          case "inlineCode":
            return (
              <Text key={index} style={{ fontFamily: "Courier" }}>
                {node.value}
              </Text>
            );
          case "link":
            return (
              <Link key={index} src={node.url} style={{ color: linkColor, textDecoration: "none" }}>
                <Inline nodes={node.children} marks={marks} linkColor={linkColor} />
              </Link>
            );
          default:
            return null;
        }
      })}
    </>
  );
}

function plain(node: RootContent | PhrasingContent): string {
  if ("value" in node && typeof node.value === "string") return node.value;
  if ("children" in node) return (node.children as (RootContent | PhrasingContent)[]).map(plain).join(" ");
  return "";
}

function Blocks({ nodes, linkColor, muted }: { nodes: RootContent[]; linkColor: string; muted: string }) {
  return (
    <>
      {nodes.map((node, index) => {
        const gap = index > 0 ? { marginTop: 4 } : {};
        switch (node.type) {
          case "paragraph":
            return (
              <Text key={index} style={gap}>
                <Inline nodes={node.children} linkColor={linkColor} />
              </Text>
            );
          case "heading":
            return (
              <Text key={index} style={{ ...gap, fontFamily: "Helvetica-Bold" }}>
                <Inline nodes={node.children} marks={{ bold: true }} linkColor={linkColor} />
              </Text>
            );
          case "list":
            return (
              <View key={index} style={gap}>
                {node.children.map((item: ListItem, itemIndex) => (
                  <View key={itemIndex} style={{ flexDirection: "row" }}>
                    <Text style={{ width: 12 }}>{node.ordered ? `${(node.start ?? 1) + itemIndex}.` : "•"}</Text>
                    <View style={{ flex: 1 }}>
                      <Blocks nodes={item.children} linkColor={linkColor} muted={muted} />
                    </View>
                  </View>
                ))}
              </View>
            );
          case "blockquote":
            return (
              <View key={index} style={{ ...gap, borderLeftWidth: 1.5, borderColor: muted, paddingLeft: 6 }}>
                <Blocks nodes={node.children} linkColor={linkColor} muted={muted} />
              </View>
            );
          case "code":
            return (
              <Text key={index} style={{ ...gap, fontFamily: "Courier" }}>
                {node.value}
              </Text>
            );
          case "thematicBreak":
            return <View key={index} style={{ marginVertical: 5, borderTopWidth: 0.6, borderColor: muted }} />;
          case "table":
            return (
              <View key={index} style={gap}>
                {node.children.map((row, rowIndex) => (
                  <Text key={rowIndex}>{row.children.map(plain).join("  ·  ")}</Text>
                ))}
              </View>
            );
          default:
            return null;
        }
      })}
    </>
  );
}

export function PdfMarkdown({ source, linkColor, muted }: { source: string; linkColor: string; muted: string }) {
  const tree = parser.parse(source);
  return <Blocks nodes={tree.children} linkColor={linkColor} muted={muted} />;
}

/**
 * Splits a "How to pay" text into an introduction and one section per bank.
 *
 * A horizontal rule (---) separates banks. Without rules, each heading starts
 * a bank, and whatever comes before the first heading is the introduction.
 * Text with neither is a single section, printed as before.
 */
function sections(source: string) {
  const nodes = parser.parse(source).children;
  if (nodes.some((node) => node.type === "thematicBreak")) {
    const parts: RootContent[][] = [[]];
    for (const node of nodes) {
      if (node.type === "thematicBreak") parts.push([]);
      else parts[parts.length - 1].push(node);
    }
    return { intro: [] as RootContent[], parts: parts.filter((part) => part.length > 0) };
  }
  const headings = nodes.filter((node) => node.type === "heading").length;
  if (headings < 2) return { intro: [] as RootContent[], parts: [nodes] };
  const intro: RootContent[] = [];
  const parts: RootContent[][] = [];
  for (const node of nodes) {
    if (node.type === "heading") parts.push([node]);
    else if (parts.length === 0) intro.push(node);
    else parts[parts.length - 1].push(node);
  }
  return { intro, parts };
}

/**
 * One card per bank, in rows of equal-height cards: one bank full width, two
 * or four in pairs, otherwise three to a row. A short last row keeps the same
 * column width, so the cards line up.
 */
export function PdfPaymentColumns({
  source,
  linkColor,
  muted,
  cardStyle,
}: {
  source: string;
  linkColor: string;
  muted: string;
  /** Applied to every bank card (a style object from StyleSheet.create). */
  cardStyle: Style;
}) {
  const { intro, parts } = sections(source);
  const perRow = parts.length === 1 ? 1 : parts.length === 2 || parts.length === 4 ? 2 : 3;
  const rows: RootContent[][][] = [];
  for (let index = 0; index < parts.length; index += perRow) rows.push(parts.slice(index, index + perRow));

  return (
    <View>
      {intro.length > 0 ? (
        <View style={{ marginBottom: 8 }}>
          <Blocks nodes={intro} linkColor={linkColor} muted={muted} />
        </View>
      ) : null}
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={{ flexDirection: "row", gap: 10, marginTop: rowIndex > 0 ? 10 : 0 }} wrap={false}>
          {row.map((part, partIndex) => (
            <View key={partIndex} style={[cardStyle, { flex: 1 }]}>
              <Blocks nodes={part} linkColor={linkColor} muted={muted} />
            </View>
          ))}
          {Array.from({ length: perRow - row.length }, (_, fill) => (
            <View key={`fill-${fill}`} style={{ flex: 1 }} />
          ))}
        </View>
      ))}
    </View>
  );
}
