import { Input } from "antd";

/**
 * A text array edited as a plain multi-line box, one entry per line — an
 * address, for instance, where commas belong inside a line. Empty lines are
 * kept while typing (so Enter works) and dropped when the form is saved.
 */
export function LinesInput({ value, onChange, rows = 4, placeholder }: { value?: string[]; onChange?: (next: string[]) => void; rows?: number; placeholder?: string }) {
  return (
    <Input.TextArea
      value={(value ?? []).join("\n")}
      onChange={(event) => onChange?.(event.target.value.split(/\r?\n/))}
      autoSize={{ minRows: rows, maxRows: 10 }}
      placeholder={placeholder}
    />
  );
}
