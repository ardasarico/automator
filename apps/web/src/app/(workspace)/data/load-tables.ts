import { cache } from "react";
import { listDataTables } from "../../../data/server";

/** The section's tables, read once per render: the layout's rail and the gallery share this. */
export const loadTables = cache(listDataTables);
