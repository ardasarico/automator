import type { Metadata } from "next";
import { ButtonExamples } from "./button-examples";

export const metadata: Metadata = { title: "Button" };

export default function ButtonPage() {
  return (
    <>
      <h1 className="mb-6 text-section">Button</h1>
      <ButtonExamples />
    </>
  );
}
