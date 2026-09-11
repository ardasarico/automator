import { SidePanelSkeleton } from "../../../../../../components/side-panel-skeleton";

/** The panel opens with the record still loading, so the grid settles into its narrower column once. */
export default function RecordPanelLoading() {
  return <SidePanelSkeleton label="Record details" />;
}
