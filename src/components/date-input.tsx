import { DatePicker } from "antd";
import type { CSSProperties } from "react";
import dayjs, { type Dayjs } from "dayjs";

const FORMATS = { date: "YYYY-MM-DD", month: "YYYY-MM", datetime: "YYYY-MM-DDTHH:mm" } as const;
const SHOWN = { date: "D MMM YYYY", month: "MMM YYYY", datetime: "D MMM YYYY HH:mm" } as const;

/**
 * The app's date field: antd's DatePicker, but it takes and gives dates as the
 * text the database and forms use ("2026-10-13", "2026-10" for a month,
 * "2026-10-13T09:30" with a time), so it drops in wherever a date is kept as
 * a string — in a Form.Item or with value/onChange. `min`/`max` are the same
 * text and grey out the days outside them. Empty gives "".
 */
export function DateInput({
  value,
  onChange,
  picker = "date",
  min,
  max,
  style,
  disabled,
  placeholder,
  allowClear = true,
  id,
  "aria-label": ariaLabel,
}: {
  value?: string | null;
  onChange?: (value: string) => void;
  picker?: "date" | "month" | "datetime";
  min?: string | null;
  max?: string | null;
  style?: CSSProperties;
  disabled?: boolean;
  placeholder?: string;
  allowClear?: boolean;
  id?: string;
  "aria-label"?: string;
}) {
  const format = FORMATS[picker];
  const parse = (text: string | null | undefined) => {
    if (!text) return null;
    const parsed = dayjs(text);
    return parsed.isValid() ? parsed : null;
  };
  const low = parse(min);
  const high = parse(max);
  const unit = picker === "month" ? "month" : "day";
  const outside = (day: Dayjs) => Boolean((low && day.isBefore(low, unit)) || (high && day.isAfter(high, unit)));

  return (
    <DatePicker
      id={id}
      aria-label={ariaLabel}
      value={parse(value)}
      onChange={(day) => onChange?.(day ? day.format(format) : "")}
      picker={picker === "month" ? "month" : "date"}
      showTime={picker === "datetime" ? { format: "HH:mm" } : undefined}
      format={SHOWN[picker]}
      disabledDate={low || high ? outside : undefined}
      style={{ width: "100%", ...style }}
      disabled={disabled}
      placeholder={placeholder}
      allowClear={allowClear}
    />
  );
}
