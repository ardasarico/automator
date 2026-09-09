import { PageFrame } from "../../../components/page-frame";
import { Skeleton } from "../../../components/skeleton";
import type { FlowView } from "./flow-browser";
import styles from "./flows.module.css";

const cards = [0, 1, 2, 3, 4, 5];
const rows = [0, 1, 2, 3, 4, 5, 6, 7];

/** A card with its shape panel still empty — the canvas ground reads as the miniature's place. */
function CardSkeleton() {
  return (
    <li className={styles.flowCard}>
      <div className={styles.cardShape} />
      <div className={styles.cardBody}>
        <div className={styles.cardHeading}>
          <Skeleton className={styles.ghostName} />
        </div>
        <Skeleton className={styles.ghostTrigger} />
        <Skeleton className={styles.ghostRun} />
      </div>
    </li>
  );
}

function RowSkeleton() {
  return (
    <tr>
      <th scope="row">
        <span className={styles.tableFlow}>
          <span className={styles.tableShape} />
          <Skeleton className={styles.ghostFlowName} />
        </span>
      </th>
      <td className={styles.tableTrigger}>
        <Skeleton className={styles.ghostCell} />
      </td>
      <td>
        <Skeleton className={styles.ghostCell} />
      </td>
      <td className={styles.tableEdited}>
        <Skeleton className={styles.ghostCellSm} />
      </td>
      <td className={styles.numeric}>
        <Skeleton className={styles.ghostCellSm} />
      </td>
      <td className={styles.tableActions}>
        <span className="sr-only">Actions</span>
      </td>
    </tr>
  );
}

/**
 * Flows' shape while the list is being read: the same frame, the same controls at the same
 * size, and the view the visitor last chose, so nothing on the page moves when it arrives.
 */
export function FlowsSkeleton({ view }: { view: FlowView }) {
  return (
    <PageFrame
      title="Flows"
      actions={
        <>
          <Skeleton className={styles.ghostSearch} />
          <Skeleton className={styles.ghostAction} />
        </>
      }
      toolbar={
        <>
          <Skeleton className={styles.ghostSort} />
          <Skeleton className={styles.ghostView} />
        </>
      }
    >
      <p className="sr-only" role="status">
        Loading flows
      </p>
      {view === "grid" ? (
        <ul className={styles.flowGrid} aria-hidden="true">
          {cards.map((card) => (
            <CardSkeleton key={card} />
          ))}
        </ul>
      ) : (
        <div className={styles.tableWrap} aria-hidden="true">
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Trigger</th>
                <th scope="col">Last run</th>
                <th scope="col">Edited</th>
                <th scope="col" className={styles.numeric}>
                  Nodes
                </th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <RowSkeleton key={row} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageFrame>
  );
}
