import "server-only";
import { AuthApiError, requestAuth } from "@automator/api-client/server";
import { isOnboarded, meContract } from "@automator/contracts";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

export const SESSION_COOKIE = "automator-session";
export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    return (await requestAuth(process.env.API_URL, token, meContract)).user;
  } catch (error) {
    if (error instanceof AuthApiError && error.status === 401) return null;
    throw error;
  }
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isOnboarded(user)) redirect("/onboarding");
  return user;
}
