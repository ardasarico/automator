import { create } from "qrcode";
import type React from "react";

export function QrCode({ value, label }: { value: string; label: string }): React.ReactElement {
  let matrix: { size: number; data: Uint8Array };
  try {
    matrix = create(value, { errorCorrectionLevel: "M" }).modules;
  } catch {
    return (
      <p className="flex size-full items-center justify-center rounded-lg border border-dashed p-4 text-caption text-center text-pretty text-muted-foreground">
        This value is too long for a QR code.
      </p>
    );
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
