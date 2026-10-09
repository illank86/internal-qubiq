import { useRef } from "react";
import { Button, Flex, Input, Tooltip, Typography, theme } from "antd";
import type { InputRef } from "antd";
import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, PlusOutlined } from "@ant-design/icons";

/**
 * A list of short texts — release highlights, key points — one row each:
 * type, press Enter for the next, reorder, remove. A form control
 * (value / onChange), stored as a text array.
 */
export function ListInput({ value, onChange, addLabel = "Add item", placeholder }: { value?: string[]; onChange?: (next: string[]) => void; addLabel?: string; placeholder?: string }) {
  const { token } = theme.useToken();
  const items = value ?? [];
  const inputs = useRef<(InputRef | null)[]>([]);
  const set = (next: string[]) => onChange?.(next);
  const focus = (index: number) => setTimeout(() => inputs.current[index]?.focus(), 0);
  const add = (at = items.length) => {
    set([...items.slice(0, at), "", ...items.slice(at)]);
    focus(at);
  };
  const move = (from: number, to: number) => {
    const next = [...items];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    set(next);
  };

  return (
    <Flex vertical gap={6}>
      {items.length === 0 ? (
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          Nothing yet.
        </Typography.Text>
      ) : null}
      {items.map((item, index) => (
        <Flex key={index} align="center" gap={6}>
          <span
            style={{
              width: 22,
              flexShrink: 0,
              textAlign: "center",
              fontSize: 12,
              color: token.colorTextTertiary,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {index + 1}
          </span>
          <Input
            ref={(element) => {
              inputs.current[index] = element;
            }}
            value={item}
            placeholder={placeholder}
            onChange={(event) => set(items.map((current, position) => (position === index ? event.target.value : current)))}
            onKeyDown={(event) => {
              // Enter: a new row below. Backspace on an empty row: remove it.
              if (event.key === "Enter") {
                event.preventDefault();
                add(index + 1);
              } else if (event.key === "Backspace" && item === "" && items.length > 0) {
                event.preventDefault();
                set(items.filter((_, position) => position !== index));
                focus(Math.max(0, index - 1));
              }
            }}
          />
          <Tooltip title="Move up">
            <Button type="text" size="small" icon={<ArrowUpOutlined />} disabled={index === 0} onClick={() => move(index, index - 1)} aria-label="Move up" />
          </Tooltip>
          <Tooltip title="Move down">
            <Button type="text" size="small" icon={<ArrowDownOutlined />} disabled={index === items.length - 1} onClick={() => move(index, index + 1)} aria-label="Move down" />
          </Tooltip>
          <Tooltip title="Remove">
            <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => set(items.filter((_, position) => position !== index))} aria-label="Remove" />
          </Tooltip>
        </Flex>
      ))}
      <Button type="dashed" icon={<PlusOutlined />} onClick={() => add()} style={{ alignSelf: "flex-start", marginLeft: 28 }}>
        {addLabel}
      </Button>
    </Flex>
  );
}
