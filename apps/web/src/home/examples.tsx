import { flowExamples } from "../app/(workspace)/marketplace/examples";
import { FlowActionCard } from "../flows/action-button";
import { createFlowAction } from "../flows/actions";
import Link from "next/link";
import styles from "./home.module.css";

/** The three that need no setup beyond a Discord webhook, so pressing one lands on a live canvas. */
const featured = ["scheduled-reminder", "ai-digest", "usdc-balance-alert"];

/**
 * The other way in. The prompt writes a flow from a sentence; these hand over one that already
 * works, copied into the workspace and opened on the canvas by the same action the marketplace uses.
 */
export function HomeExamples() {
  const examples = featured
    .map((id) => flowExamples.find((example) => example.id === id))
    .filter((example) => example !== undefined);
  return (
    <section className={styles.examplesSection} aria-labelledby="home-examples">
      <div className={styles.activityHead}>
        <h2 id="home-examples">Start from an example</h2>
        <Link href="/marketplace" className={styles.all}>
          All examples →
        </Link>
      </div>
      <div className={styles.exampleGrid}>
        {examples.map((example) => (
          <FlowActionCard
            key={example.id}
            action={createFlowAction.bind(null, { example: example.id })}
            className={styles.exampleCard}
          >
            <span className={styles.exampleCardIcons}>
              {example.nodes.map(({ name, icon: Icon }) => (
                <Icon key={name} aria-hidden="true" />
              ))}
            </span>
            <span className={styles.exampleCardName}>{example.name}</span>
            <span className={styles.exampleCardText}>{example.description}</span>
            <span className={styles.exampleCardStart}>Fork and open →</span>
          </FlowActionCard>
        ))}
      </div>
    </section>
  );
}
