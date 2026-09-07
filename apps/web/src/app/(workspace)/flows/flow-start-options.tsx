import { RiAddLine, RiGitForkLine, RiSparklingLine } from "@remixicon/react";
import type { RemixiconComponentType } from "@remixicon/react";
import Link from "next/link";
import styles from "./flows.module.css";

const options: readonly {
  href: string;
  icon: RemixiconComponentType;
  title: string;
  body: string;
}[] = [
  {
    href: "/create?ai=1",
    icon: RiSparklingLine,
    title: "Describe it to AI",
    body: "Say what should happen; the assistant drafts the nodes and you refine them.",
  },
  {
    href: "#flow-examples-title",
    icon: RiGitForkLine,
    title: "Start from an example",
    body: "Fork a working flow below, then change what it watches and where it posts.",
  },
  {
    href: "/create",
    icon: RiAddLine,
    title: "Start blank",
    body: "An empty canvas. Drag a trigger in and build from there.",
  },
];

/** The three ways into a first flow, shown in the empty state of the flows page. */
export function FlowStartOptions() {
  return (
    <ul className={styles.startGrid} aria-label="Ways to start">
      {options.map(({ href, icon: Icon, title, body }) => (
        <li key={href}>
          <Link href={href} className={styles.startCard}>
            <span className={styles.startIcon} aria-hidden="true">
              <Icon />
            </span>
            <span className="text-label">{title}</span>
            <span className={styles.startBody}>{body}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
