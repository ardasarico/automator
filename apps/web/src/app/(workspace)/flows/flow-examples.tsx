import { Button } from "@automator/ui/button";
import { RiGitForkLine } from "@remixicon/react";
import Link from "next/link";
import { flowExamples } from "../marketplace/examples";
import { FlowNodeMarks } from "../marketplace/flow-node-marks";
import styles from "./flows.module.css";

export function FlowExamples() {
  return (
    <section aria-labelledby="flow-examples-title">
      <header className="mb-5">
        <h2 id="flow-examples-title" className="text-section">
          Start from a flow
        </h2>
        <p className="mt-1 text-caption text-muted-foreground">
          Fork a starting point and make it yours.
        </p>
      </header>
      <div className={styles.exampleGrid}>
        {flowExamples.map((example) => {
          return (
            <article
              key={example.id}
              className={styles.exampleCard}
              aria-labelledby={`${example.id}-title`}
            >
              <div className="mb-4">
                <FlowNodeMarks nodes={example.nodes} />
              </div>
              <h3 id={`${example.id}-title`} className="text-label">
                <Link href={`/marketplace/${example.id}`} className={styles.exampleLink}>
                  {example.name}
                </Link>
              </h3>
              <p className={styles.exampleDescription}>{example.description}</p>
              <div className={styles.templateActions}>
                <span className="text-caption text-muted-foreground">Automator</span>
                <Button
                  className="relative z-10"
                  variant="outline"
                  size="sm"
                  render={<Link href={`/create?example=${example.id}`} />}
                  aria-label={`Fork flow: ${example.name}`}
                >
                  <RiGitForkLine aria-hidden="true" />
                  Fork flow
                </Button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
