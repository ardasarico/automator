import "server-only";
import { cookies } from "next/headers";

export async function readPreferenceCookie(name: string): Promise<string | undefined> {
  const value = (await cookies()).get(name)?.value;
  return value === undefined ? undefined : decodeURIComponent(value);
}
