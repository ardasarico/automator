import styles from "../../builder/flow-builder.module.css";
import { Skeleton } from "../../components/skeleton";

const railButtons = [0, 1, 2, 3];
const panelRows = [0, 1, 2, 3, 4, 5];

/**
 * The builder's chrome before the flow arrives: the sidebar rail, the left panel, the header
 * bar and the empty canvas ground, on the builder's own classes so nothing moves when the
 * document lands and the page swaps in.
 */
export default function CanvasLoading() {
  return (
    <>
      <p className="sr-only" role="status">
        Loading flow
      </p>
      <div className={styles.builder} aria-hidden="true">
        <div className={styles.rail} data-side="left">
          <div className={styles.railHeader}>
            <Skeleton className="size-7" />
          </div>
          <div className={styles.railBody}>
            {railButtons.map((button) => (
              <Skeleton key={button} className="size-7" />
            ))}
          </div>
        </div>
        <div className={styles.leftPanel}>
          <div className={styles.panelHeader}>
            <Skeleton className="h-4 w-36" />
          </div>
          <div className="flex flex-col gap-3 p-3">
            {panelRows.map((row) => (
              <Skeleton key={row} className="h-8 w-full" />
            ))}
          </div>
        </div>
        <div className={styles.canvasColumn}>
          <div className={styles.canvasHeader}>
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-7 w-20" />
            <Skeleton className="ml-auto h-7 w-24" />
          </div>
          <div className={`${styles.canvas} bg-canvas`} />
        </div>
      </div>
    </>
  );
}
