import { cache } from "react";
import { listDataTables } from "../../../data/server";

/** The section's tables, read once per render: the index and the title-bar switcher share this. */
export const loadTables = cache(listDataTables);
