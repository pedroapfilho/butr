import { source } from "@/lib/source";
import { createFromSource } from "fumadocs-core/search/server";

// Statically cached Orama index — no server runtime needed.
export const revalidate = false;

export const { staticGET: GET } = createFromSource(source);
