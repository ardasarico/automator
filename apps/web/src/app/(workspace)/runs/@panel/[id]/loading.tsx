import { SidePanelSkeleton } from "../../../../../components/side-panel-skeleton";

/** The panel opens with the run still loading, so the list settles into its narrower column once. */
export default function RunPanelLoading() {
  return <SidePanelSkeleton label="Run details" />;
}
