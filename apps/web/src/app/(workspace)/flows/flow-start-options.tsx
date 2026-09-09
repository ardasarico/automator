import { RiAddLine, RiGitForkLine, RiSparklingLine } from "@remixicon/react";
import type { RemixiconComponentType } from "@remixicon/react";
import Link from "next/link";
import { FlowActionCard } from "../../../flows/action-button";
import { createFlowAction } from "../../../flows/actions";
import styles from "./flows.module.css";

const options: readonly {
  id: string;
  href?: string;
  action?: () => Promise<void>;
  icon: RemixiconComponentType;
  title: string;
  body: string;
}[] = [
  {
    /*
     * The description is collected where the drafting happens, on Home. Creating the flow here
     * first would persist an "Untitled flow" before the user has said anything, and leaving
     * without asking — or a draft that fails — would leave that empty flow behind.
     */
    id: "ai",
    href: "/?draft=1",
    icon: RiSparklingLine,
    title: "Describe it to AI",
    body: "Say what should happen; the assistant drafts the nodes and you refine them.",
  },
  {
    href: "#flow-examples-title",
    id: "examples",
    icon: RiGitForkLine,
    title: "Start from an example",
    body: "Fork a working flow below, then change what it watches and where it posts.",
  },
  {
    id: "blank",
    action: createFlowAction.bind(null, {}),
    icon: RiAddLine,
    title: "Start blank",
    body: "An empty canvas. Drag a trigger in and build from there.",
  },
];

export function FlowStartOptions() {
  return (
    <ul className={styles.startGrid} aria-label="Ways to start">
      {options.map(({ id, href, action, icon: Icon, title, body }) => {
        const content = (
          <>
            <span className={styles.startIcon} aria-hidden="true">
              <Icon />
            </span>
            <span className="text-label">{title}</span>
            <span className={styles.startBody}>{body}</span>
          </>
        );
        return (
          <li key={id}>
            {action ? (
              <FlowActionCard action={action} className={styles.startCard}>
                {content}
              </FlowActionCard>
            ) : (
              <Link href={href!} className={styles.startCard}>
                {content}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
