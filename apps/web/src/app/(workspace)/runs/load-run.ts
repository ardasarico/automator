import { cache } from "react";
import { getRun } from "../../../flows/server";

/* The list route titles the page and the panel slot renders it, both in the same pass:
 * cache() keeps that one request. */
export const loadRun = cache((id: string) => getRun(id));
