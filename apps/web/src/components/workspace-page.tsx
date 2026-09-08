import type { ReactNode } from "react";

export function WorkspacePage({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mx-auto w-full max-w-[1440px] px-4 pt-2 pb-12 ${className}`.trimEnd()}>
      {children}
    </div>
  );
}
