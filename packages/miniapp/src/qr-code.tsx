import { create } from "qrcode";
import type React from "react";

/**
 * A QR code as one SVG path over a white plate, so it scans in both themes. The matrix is
 * computed synchronously; an unencodable value (empty, or too long) renders nothing.
 */
export function QrCode({
  value,
  label,
}: {
  value: string;
  label: string;
}): React.ReactElement | null {
  let matrix: { size: number; data: Uint8Array };
  try {
    matrix = create(value, { errorCorrectionLevel: "M" }).modules;
  } catch {
    return null;
  }
  const { size, data } = matrix;
  const quiet = 2;
  const cells: string[] = [];
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (data[row * size + col]) cells.push(`M${col + quiet} ${row + quiet}h1v1h-1z`);
    }
  }
  const extent = size + quiet * 2;
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${extent} ${extent}`}
      className="size-full rounded-lg bg-white text-black"
      shapeRendering="crispEdges"
    >
      <path d={cells.join("")} fill="currentColor" />
    </svg>
  );
}
