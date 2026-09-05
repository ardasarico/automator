import type { Metadata } from "next";
import { DialogExamples } from "./dialog-examples";

export const metadata: Metadata = { title: "Dialog" };

export default function DialogPage() {
  return (
    <>
      <h1 className="mb-6 text-section">Dialog</h1>
      <DialogExamples />
    </>
  );
}
