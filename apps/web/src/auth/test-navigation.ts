/* Bun module mocks are process-wide; all next/navigation mocks must share this implementation. */
export const navigation = {
  pathname: "/",
  replaced: [] as string[],
  reset() {
    navigation.pathname = "/";
    navigation.replaced.length = 0;
  },
};

export const navigationModule = {
  useRouter: () => ({
    replace: (href: string) => {
      navigation.replaced.push(href);
    },
    push: (href: string) => {
      navigation.replaced.push(href);
    },
    refresh: () => {},
  }),
  usePathname: () => navigation.pathname,
  redirect: (href: string): never => {
    throw controlFlow(`redirect:${href}`, `NEXT_REDIRECT;replace;${href};307;`);
  },
  notFound: (): never => {
    throw controlFlow("notFound", "NEXT_HTTP_ERROR_FALLBACK;404");
  },
  /*
   * Next throws redirect and notFound to steer the request, and `unstable_rethrow` is how a
   * catch puts them back instead of reporting them as failures. Server actions catch their own
   * errors to answer with a message, so a mock without this turns a redirect into that message.
   */
  unstable_rethrow: (error: unknown): void => {
    if (error instanceof Error && typeof (error as { digest?: unknown }).digest === "string") {
      throw error;
    }
  },
};

/** Shaped like the errors Next throws for control flow: a digest is what marks them as such. */
function controlFlow(message: string, digest: string): Error {
  return Object.assign(new Error(message), { digest });
}

/**
 * The error a real `redirect()` throws, for stubbing something that redirects. A plain Error
 * would not carry the digest, so a caller that rethrows framework errors would treat it as a
 * failure — which is the opposite of what the code under test does in production.
 */
export function redirectError(href: string): Error {
  return controlFlow(`redirect:${href}`, `NEXT_REDIRECT;replace;${href};307;`);
}
