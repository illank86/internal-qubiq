import type { Database } from "@/lib/database.types";

export type AppPermission = Database["public"]["Enums"]["app_permission"];
export type AppRole = Database["public"]["Enums"]["app_role"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
