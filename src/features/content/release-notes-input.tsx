import { useMemo, useRef, useState } from "react";
import { Button, Dropdown, Empty, Flex, Input, Modal, Segmented, Tooltip, Typography, theme } from "antd";
import type { TextAreaRef } from "antd/es/input/TextArea";
import { ArrowDownOutlined, ArrowUpOutlined, CheckOutlined, DeleteOutlined, DownOutlined, EditOutlined, PlusOutlined, RightOutlined, SearchOutlined, SnippetsOutlined } from "@ant-design/icons";

/**
 * Release notes: each highlight is a sentence with a kind — New, Improved or
 * Fixed. Stored as before, the kind written in front ("Fixed: …"), which is
 * how the website groups them into What's new / Improvements / Bug fixes; here
 * the kind is a chip, never typed.
 */

const KINDS = [
  { kind: "New", heading: "What's new", color: "#16a34a", soft: "rgba(22, 163, 74, 0.12)" },
  { kind: "Improved", heading: "Improvements", color: "#2563eb", soft: "rgba(37, 99, 235, 0.12)" },
  { kind: "Fixed", heading: "Bug fixes", color: "#ea580c", soft: "rgba(234, 88, 12, 0.12)" },
] as const;
type Kind = (typeof KINDS)[number]["kind"];
type Note = { kind: Kind; text: string };

const style = (kind: Kind) => KINDS.find((item) => item.kind === kind)!;

/** "Fixed: text" → { Fixed, text }; no prefix counts as New, as on the website. */
function parse(line: string): Note {
  for (const { kind } of KINDS) {
    const prefix = `${kind}: `;
    if (line.startsWith(prefix)) return { kind, text: line.slice(prefix.length) };
  }
  return { kind: "New", text: line };
}
const serialise = (notes: Note[]) =>
  // Kept in website order (new, improved, fixed); the order within a kind is the editor's.
  KINDS.flatMap(({ kind }) => notes.filter((note) => note.kind === kind && note.text.trim()).map((note) => `${note.kind}: ${note.text.trim()}`));

/** A kind as a small coloured pill. */
function KindPill({ kind, active = true, onClick }: { kind: Kind; active?: boolean; onClick?: () => void }) {
  const { color, soft } = style(kind);
  return (
    <span
      onClick={onClick}
      role={onClick ? "button" : undefined}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "2px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        cursor: onClick ? "pointer" : undefined,
        color: active ? color : undefined,
        background: active ? soft : "transparent",
        border: `1px solid ${active ? "transparent" : "var(--ant-color-border)"}`,
        whiteSpace: "nowrap",
        userSelect: "none",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
      {kind}
    </span>
  );
}

/** "Lead — detail": the lead in bold, as the website shows it. */
function NoteText({ text }: { text: string }) {
  const dash = text.indexOf(" — ");
  const lead = dash === -1 ? null : text.slice(0, dash);
  if (!lead || lead.length > 48 || lead.split(/\s+/).length > 6 || /[,:;]/.test(lead)) return <>{text}</>;
  return (
    <>
      <Typography.Text strong>{lead}</Typography.Text> — {text.slice(dash + 3)}
    </>
  );
}

export function ReleaseNotesInput({ value, onChange }: { value?: string[]; onChange?: (next: string[]) => void }) {
  const { token } = theme.useToken();
  const notes = useMemo(() => (value ?? []).map(parse), [value]);
  const set = (next: Note[]) => onChange?.(serialise(next));

  const [draftKind, setDraftKind] = useState<Kind>("New");
  const [draft, setDraft] = useState("");
  const [filter, setFilter] = useState<"All" | Kind>("All");
  const [search, setSearch] = useState("");
  const [closed, setClosed] = useState<Set<Kind>>(new Set());
  const [editing, setEditing] = useState<{ index: number; text: string } | null>(null);
  const [pasting, setPasting] = useState(false);
  const composer = useRef<TextAreaRef>(null);

  const add = () => {
    const text = draft.trim().replace(/^[-•*]\s*/, "");
    if (!text) return;
    set([...notes, { kind: draftKind, text }]);
    setDraft("");
    composer.current?.focus();
  };
  const count = (kind: Kind) => notes.filter((note) => note.kind === kind).length;
  const query = search.trim().toLowerCase();
  // Moving within a kind: swap with the previous / next note of the same kind.
  const neighbour = (index: number, step: 1 | -1) => {
    for (let at = index + step; at >= 0 && at < notes.length; at += step) if (notes[at].kind === notes[index].kind) return at;
    return -1;
  };
  const swap = (a: number, b: number) => {
    const next = [...notes];
    [next[a], next[b]] = [next[b], next[a]];
    set(next);
  };

  return (
    <Flex vertical gap={12}>
      {/* Composer: pick the kind, write, add. */}
      <div style={{ border: `1px solid ${token.colorBorderSecondary}`, borderRadius: token.borderRadiusLG, padding: 12, background: token.colorFillQuaternary }}>
        <Flex gap={6} align="center" wrap style={{ marginBottom: 8 }}>
          <Typography.Text type="secondary" style={{ fontSize: 12, marginRight: 4 }}>
            Type
          </Typography.Text>
          {KINDS.map(({ kind }) => (
            <KindPill key={kind} kind={kind} active={draftKind === kind} onClick={() => setDraftKind(kind)} />
          ))}
        </Flex>
        <Input.TextArea
          ref={composer}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              add();
            }
          }}
          autoSize={{ minRows: 2, maxRows: 6 }}
          placeholder="e.g. Siemens S7 driver — connect to S7-300/400 by absolute address"
        />
        <Flex justify="space-between" align="center" style={{ marginTop: 8 }} gap={8} wrap>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Ctrl + Enter to add · “Lead — detail” shows the lead in bold
          </Typography.Text>
          <Flex gap={8}>
            <Button icon={<SnippetsOutlined />} onClick={() => setPasting(true)}>
              Paste many
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={add} disabled={!draft.trim()}>
              Add {draftKind.toLowerCase()}
            </Button>
          </Flex>
        </Flex>
      </div>

      {notes.length > 0 ? (
        <Flex justify="space-between" align="center" gap={8} wrap>
          <Segmented<"All" | Kind>
            size="small"
            value={filter}
            onChange={setFilter}
            options={[{ value: "All", label: `All ${notes.length}` }, ...KINDS.map(({ kind }) => ({ value: kind, label: `${kind} ${count(kind)}` }))]}
          />
          <Input size="small" allowClear prefix={<SearchOutlined />} placeholder="Search notes" value={search} onChange={(event) => setSearch(event.target.value)} style={{ maxWidth: 220 }} />
        </Flex>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No highlights yet — add the first above." style={{ margin: "8px 0" }} />
      )}

      {KINDS.filter(({ kind }) => filter === "All" || filter === kind).map(({ kind, heading, color }) => {
        const rows = notes.map((note, index) => ({ note, index })).filter(({ note }) => note.kind === kind && (!query || note.text.toLowerCase().includes(query)));
        if (rows.length === 0) return null;
        const isClosed = closed.has(kind) && !query;
        return (
          <div key={kind} style={{ border: `1px solid ${token.colorBorderSecondary}`, borderRadius: token.borderRadiusLG, overflow: "hidden" }}>
            <Flex
              align="center"
              gap={8}
              onClick={() => setClosed((current) => new Set(current.has(kind) ? [...current].filter((item) => item !== kind) : [...current, kind]))}
              style={{ padding: "8px 12px", cursor: "pointer", background: token.colorFillTertiary, borderLeft: `3px solid ${color}` }}
            >
              {isClosed ? <RightOutlined style={{ fontSize: 10 }} /> : <DownOutlined style={{ fontSize: 10 }} />}
              <Typography.Text strong>{heading}</Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {rows.length}
              </Typography.Text>
            </Flex>
            {isClosed
              ? null
              : rows.map(({ note, index }, position) => {
                  const isEditing = editing?.index === index;
                  return (
                    <Flex
                      key={index}
                      className="release-note-row"
                      align="flex-start"
                      gap={10}
                      style={{ padding: "8px 12px", borderTop: position ? `1px solid ${token.colorBorderSecondary}` : undefined, background: token.colorBgContainer }}
                    >
                      <Dropdown
                        trigger={["click"]}
                        menu={{
                          items: KINDS.map((item) => ({ key: item.kind, label: <KindPill kind={item.kind} /> })),
                          onClick: ({ key }) => set(notes.map((current, at) => (at === index ? { ...current, kind: key as Kind } : current))),
                        }}
                      >
                        <span style={{ marginTop: 1 }}>
                          <Tooltip title="Change type">
                            <span>
                              <KindPill kind={note.kind} onClick={() => undefined} />
                            </span>
                          </Tooltip>
                        </span>
                      </Dropdown>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {isEditing ? (
                          <Input.TextArea
                            autoFocus
                            value={editing.text}
                            autoSize={{ minRows: 1, maxRows: 8 }}
                            onChange={(event) => setEditing({ index, text: event.target.value })}
                            onKeyDown={(event) => {
                              if (event.key === "Escape") setEditing(null);
                              if (event.key === "Enter" && !event.shiftKey) {
                                event.preventDefault();
                                set(notes.map((current, at) => (at === index ? { ...current, text: editing.text } : current)));
                                setEditing(null);
                              }
                            }}
                          />
                        ) : (
                          <Typography.Text style={{ fontSize: 13, lineHeight: 1.55 }} onDoubleClick={() => setEditing({ index, text: note.text })}>
                            <NoteText text={note.text} />
                          </Typography.Text>
                        )}
                      </div>
                      <Flex gap={0} style={{ flexShrink: 0 }}>
                        {isEditing ? (
                          <Button
                            type="text"
                            size="small"
                            icon={<CheckOutlined />}
                            aria-label="Done"
                            onClick={() => {
                              set(notes.map((current, at) => (at === index ? { ...current, text: editing.text } : current)));
                              setEditing(null);
                            }}
                          />
                        ) : (
                          <Button type="text" size="small" icon={<EditOutlined />} aria-label="Edit" onClick={() => setEditing({ index, text: note.text })} />
                        )}
                        <Button type="text" size="small" icon={<ArrowUpOutlined />} aria-label="Move up" disabled={neighbour(index, -1) < 0} onClick={() => swap(index, neighbour(index, -1))} />
                        <Button type="text" size="small" icon={<ArrowDownOutlined />} aria-label="Move down" disabled={neighbour(index, 1) < 0} onClick={() => swap(index, neighbour(index, 1))} />
                        <Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label="Delete" onClick={() => set(notes.filter((_, at) => at !== index))} />
                      </Flex>
                    </Flex>
                  );
                })}
          </div>
        );
      })}

      <PasteNotes
        open={pasting}
        onClose={() => setPasting(false)}
        onAdd={(added) => {
          set([...notes, ...added]);
          setPasting(false);
        }}
      />
    </Flex>
  );
}

/** Many notes at once: one per line; "Fixed: …" lines keep their type, the rest take the one chosen. */
function PasteNotes({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (notes: Note[]) => void }) {
  const [text, setText] = useState("");
  const [kind, setKind] = useState<Kind>("New");
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-•*]\s*/, ""))
    .filter(Boolean)
    .map((line) => {
      const typed = KINDS.some(({ kind: name }) => line.startsWith(`${name}: `));
      return typed ? parse(line) : { kind, text: line };
    });
  const counts = KINDS.map(({ kind: name }) => [name, lines.filter((line) => line.kind === name).length] as const).filter(([, n]) => n > 0);
  return (
    <Modal
      open={open}
      title="Paste release notes"
      okText={lines.length ? `Add ${lines.length}` : "Add"}
      okButtonProps={{ disabled: lines.length === 0 }}
      onOk={() => {
        onAdd(lines);
        setText("");
      }}
      onCancel={onClose}
      width={640}
      destroyOnHidden
    >
      <Typography.Paragraph type="secondary">
        One note per line. Lines starting with “New:”, “Improved:” or “Fixed:” keep that type; the others are added as:
      </Typography.Paragraph>
      <Flex gap={6} style={{ marginBottom: 12 }}>
        {KINDS.map(({ kind: name }) => (
          <KindPill key={name} kind={name} active={kind === name} onClick={() => setKind(name)} />
        ))}
      </Flex>
      <Input.TextArea value={text} onChange={(event) => setText(event.target.value)} autoSize={{ minRows: 8, maxRows: 18 }} placeholder={"Fixed: Alarm history honours the time window\nNew: Sync all UDT instances in one action"} />
      {counts.length ? (
        <Flex gap={8} style={{ marginTop: 10 }} wrap>
          {counts.map(([name, n]) => (
            <Typography.Text key={name} type="secondary" style={{ fontSize: 12 }}>
              <KindPill kind={name} /> × {n}
            </Typography.Text>
          ))}
        </Flex>
      ) : null}
    </Modal>
  );
}
