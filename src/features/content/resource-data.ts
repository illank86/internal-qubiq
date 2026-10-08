import { supabase } from "@/lib/supabase";
import { formatDuration, parseDuration } from "./media";
import type { Field, Resource } from "./resources";
import type { Lookups } from "./field-input";

export type Row = Record<string, unknown> & { id?: string | boolean };

/**
 * The generic resource screens talk to tables by name, which the typed client
 * cannot check; RLS still decides every read and write.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = (name: string) => (supabase as any).from(name);

export async function fetchRows(resource: Resource): Promise<Row[]> {
  let query = table(resource.key).select("*").limit(2000);
  for (const sort of resource.defaultSort ?? [{ column: "created_at", ascending: false }]) {
    query = query.order(sort.column, { ascending: sort.ascending ?? true, nullsFirst: false });
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Row[];
}

export async function fetchSingleton(resource: Resource): Promise<Row | null> {
  const { data, error } = await table(resource.key).select("*").eq("id", true).maybeSingle();
  if (error) throw error;
  return (data ?? null) as Row | null;
}

/** Options for every relation field: id → the related row's label column. */
export async function fetchLookups(resource: Resource): Promise<Lookups> {
  const lookups: Lookups = {};
  await Promise.all(
    resource.fields
      .filter((field) => field.relation)
      .map(async (field) => {
        const { table: name, labelColumn, orderBy } = field.relation!;
        const { data } = await table(name)
          .select(`id, ${labelColumn}`)
          .order(orderBy ?? labelColumn)
          .limit(2000);
        lookups[field.name] = ((data ?? []) as Row[]).map((row) => ({ value: String(row.id), label: String(row[labelColumn] ?? row.id) }));
      }),
  );
  return lookups;
}

/** A stored value as the form shows it. */
export function toFormValue(field: Field, value: unknown): unknown {
  switch (field.type) {
    case "json":
      return value == null ? "" : JSON.stringify(value, null, 2);
    case "duration":
      return formatDuration(value as number | null);
    case "date":
      return typeof value === "string" ? value.slice(0, 10) : "";
    case "datetime":
      return typeof value === "string" ? value.slice(0, 16) : "";
    case "tags":
      return Array.isArray(value) ? value : [];
    case "boolean":
      return Boolean(value);
    default:
      return value ?? (field.type === "number" || field.type === "relation" || field.type === "select" ? null : "");
  }
}

export function toFormValues(resource: Resource, row: Row | null) {
  const values: Record<string, unknown> = {};
  for (const field of resource.fields) {
    values[field.name] = toFormValue(field, row?.[field.name]);
    if (field.type === "geo" && field.geo) values[field.geo.longitudeField] = row?.[field.geo.longitudeField] ?? null;
  }
  return values;
}

/**
 * A form value as the column takes it — the website admin's rules: empty text
 * is null, numbers are numbers, tags a list, JSON parsed (an error names the
 * field), durations in seconds.
 */
export function fromFormValues(resource: Resource, values: Record<string, unknown>) {
  const record: Record<string, unknown> = {};
  const errors: { name: string; errors: string[] }[] = [];
  for (const field of resource.fields) {
    const raw = values[field.name];
    const text = typeof raw === "string" ? raw.trim() : raw;
    switch (field.type) {
      case "boolean":
        record[field.name] = Boolean(raw);
        break;
      case "number":
        record[field.name] = raw === "" || raw == null || !Number.isFinite(Number(raw)) ? null : Number(raw);
        break;
      case "duration":
        record[field.name] = parseDuration(String(raw ?? ""));
        break;
      case "tags":
        record[field.name] = Array.isArray(raw) ? raw.map((tag) => String(tag).trim()).filter(Boolean) : [];
        break;
      case "json":
        if (!text) record[field.name] = null;
        else {
          try {
            record[field.name] = JSON.parse(String(text));
          } catch {
            errors.push({ name: field.name, errors: ["That is not valid JSON."] });
          }
        }
        break;
      case "geo":
        record[field.name] = raw == null || raw === "" ? null : Number(raw);
        if (field.geo) {
          const longitude = values[field.geo.longitudeField];
          record[field.geo.longitudeField] = longitude == null || longitude === "" ? null : Number(longitude);
        }
        break;
      default:
        record[field.name] = text === "" || text == null ? null : text;
    }
  }
  return { record, errors };
}

export async function saveRow(resource: Resource, id: string | null, record: Record<string, unknown>) {
  if (resource.singleton) {
    const { error } = await table(resource.key).update(record).eq("id", true);
    if (error) throw error;
    return;
  }
  if (id) {
    const { error } = await table(resource.key).update(record).eq("id", id);
    if (error) throw error;
    return;
  }
  // On insert an unset field is left out, so NOT NULL DEFAULT columns get their default.
  const insertable = Object.fromEntries(Object.entries(record).filter(([, value]) => value !== null));
  const { error } = await table(resource.key).insert(insertable);
  if (error) throw error;
}

export async function deleteRows(resource: Resource, ids: string[]) {
  const { error } = await table(resource.key).delete().in("id", ids);
  if (error) throw error;
}

/** Swaps sort order with the neighbour, within the row's own group when the ordering is per parent. */
export async function moveRow(resource: Resource, rows: Row[], row: Row, direction: -1 | 1) {
  const column = resource.orderColumn!;
  const scope = resource.orderScope;
  const siblings = rows
    .filter((candidate) => !scope || candidate[scope] === row[scope])
    .sort((a, b) => Number(a[column] ?? 0) - Number(b[column] ?? 0));
  const index = siblings.findIndex((candidate) => candidate.id === row.id);
  const neighbour = siblings[index + direction];
  if (!neighbour) return;
  let mine = Number(row[column] ?? 0);
  let theirs = Number(neighbour[column] ?? 0);
  // Equal numbers cannot be swapped into an order: nudge them apart.
  if (mine === theirs) theirs = mine + direction;
  [mine, theirs] = [theirs, mine];
  const first = await table(resource.key).update({ [column]: mine }).eq("id", row.id);
  if (first.error) throw first.error;
  const second = await table(resource.key).update({ [column]: theirs }).eq("id", neighbour.id);
  if (second.error) throw second.error;
}
