// Adapted from Dither Kit by ripgrim: https://www.tripwire.sh/dither-kit
// Public surface of the vendored chart pack; the rest of the directory is internal.

export { AreaChart, LineChart } from "./area-chart";
export { Area, Line, type AreaProps, type SeriesProps } from "./area";
export { BarChart } from "./bar-chart";
export { Bar, type BarProps } from "./bar";
export { Sparkline, type SparklineProps } from "./sparkline";
export { Grid } from "./grid";
export { XAxis } from "./x-axis";
export { YAxis } from "./y-axis";
export { Legend } from "./legend";
export { BlockLegend } from "./block-legend";
export { ReferenceLine } from "./reference-line";
export { Dot, ActiveDot, type DotVariant } from "./dot";
export type { CartesianChartProps } from "./cartesian-root";
export type { AreaVariant, ChartConfig, ChartType, Margins, StrokeVariant } from "./chart-context";
export type { DitherColor } from "./palette";
