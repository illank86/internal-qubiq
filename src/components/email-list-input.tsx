import { useState } from "react";
import { Flex, Select, Tag, Tooltip, Typography, theme } from "antd";
import type { Rule } from "antd/es/form";
import { MailOutlined } from "@ant-design/icons";

/** Same rule as the database's check on cc_emails. */
const EMAIL = /^[^@\s<>,;]+@[^@\s<>,;]+\.[^@\s<>,;]+$/;
export const MAX_CC = 10;

const isEmail = (value: string) => EMAIL.test(value);

/** Trimmed, lower-case, one of each — what is stored. */
export function normaliseEmails(list: readonly string[] | null | undefined) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list ?? []) {
    for (const part of raw.split(/[\s,;]+/)) {
      const email = part.trim().replace(/^<|>$/g, "").toLowerCase();
      if (email && !seen.has(email)) {
        seen.add(email);
        out.push(email);
      }
    }
  }
  return out;
}

/**
 * Form rules for a CC list: every entry an address, at most MAX_CC, and not
 * the main recipient again (`main` reads the current "To" value).
 */
export function ccRules(main?: () => string | null | undefined): Rule[] {
  return [
    {
      validator: async (_, value: string[] | undefined) => {
        const list = value ?? [];
        const bad = list.filter((email) => !isEmail(email));
        if (bad.length) throw new Error(`Not an email address: ${bad.join(", ")}`);
        if (list.length > MAX_CC) throw new Error(`Up to ${MAX_CC} people can be copied`);
        const to = (main?.() ?? "").trim().toLowerCase();
        if (to && list.includes(to)) throw new Error(`${to} already receives it as the main recipient`);
      },
    },
  ];
}

/**
 * Email addresses as tags. Type or paste — commas, semicolons, spaces and new
 * lines all separate addresses; leaving the field keeps what was typed. Invalid
 * entries stay visible in red so they can be fixed, not silently dropped.
 */
export function EmailListInput({
  value,
  onChange,
  placeholder = "Add email addresses",
  exclude,
  id,
}: {
  value?: string[];
  onChange?: (value: string[]) => void;
  placeholder?: string;
  /** The main recipient: shown as a mistake if it is added here too. */
  exclude?: string | null;
  id?: string;
}) {
  const { token } = theme.useToken();
  const [search, setSearch] = useState("");
  const list = value ?? [];
  const same = (exclude ?? "").trim().toLowerCase();

  const commit = (next: string[]) => onChange?.(normaliseEmails(next));

  return (
    <Select<string[]>
      id={id}
      mode="tags"
      open={false}
      suffixIcon={null}
      value={list}
      searchValue={search}
      onSearch={(text) => {
        // A paste or a separator: turn everything before the last separator into tags.
        if (/[\s,;]/.test(text)) {
          const parts = text.split(/[\s,;]+/);
          const rest = parts.pop() ?? "";
          commit([...list, ...parts]);
          setSearch(rest);
          return;
        }
        setSearch(text);
      }}
      onChange={(next) => {
        commit(next);
        setSearch("");
      }}
      onBlur={() => {
        if (search.trim()) commit([...list, search]);
        setSearch("");
      }}
      placeholder={placeholder}
      prefix={<MailOutlined style={{ color: token.colorTextTertiary, marginInlineEnd: 4 }} />}
      tagRender={({ value: email, closable, onClose }) => {
        const text = String(email);
        const problem = !isEmail(text) ? "Not an email address" : text === same ? "Already the main recipient" : null;
        const tag = (
          <Tag
            color={problem ? "error" : undefined}
            closable={closable}
            onClose={onClose}
            onMouseDown={(event) => event.preventDefault()}
            style={{ marginInlineEnd: 4, marginBlock: 2 }}
          >
            {text}
          </Tag>
        );
        return problem ? <Tooltip title={problem}>{tag}</Tooltip> : tag;
      }}
      style={{ width: "100%" }}
      aria-label="CC"
    />
  );
}

/** Who an email goes to, for the confirmation before sending. */
export function Recipients({ to, cc }: { to: string; cc?: string[] | null }) {
  const copied = cc ?? [];
  return (
    <Flex vertical gap={4}>
      <Flex gap={8} align="baseline" wrap>
        <Typography.Text type="secondary" style={{ width: 24 }}>
          To
        </Typography.Text>
        <Tag icon={<MailOutlined />} color="orange" style={{ marginInlineEnd: 0 }}>
          {to}
        </Tag>
      </Flex>
      {copied.length ? (
        <Flex gap={8} align="baseline" wrap>
          <Typography.Text type="secondary" style={{ width: 24 }}>
            CC
          </Typography.Text>
          <Flex gap={4} wrap style={{ flex: 1 }}>
            {copied.map((email) => (
              <Tag key={email} style={{ marginInlineEnd: 0 }}>
                {email}
              </Tag>
            ))}
          </Flex>
        </Flex>
      ) : null}
    </Flex>
  );
}
