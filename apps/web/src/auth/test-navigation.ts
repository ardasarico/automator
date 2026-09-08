/**
 * Shared `next/navigation` stub. Bun's module mocks are process-wide, so every
 * test file that needs this module must register the same implementation, and
 * the state it reports lives here rather than in one file's closure.
 */
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
    throw new Error(`redirect:${href}`);
  },
  notFound: (): never => {
    throw new Error("notFound");
  },
};
