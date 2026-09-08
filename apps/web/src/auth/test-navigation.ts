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
    throw new Error(`redirect:${href}`);
  },
  notFound: (): never => {
    throw new Error("notFound");
  },
};
