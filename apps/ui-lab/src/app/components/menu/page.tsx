import type { Metadata } from "next";
import { MenuExamples } from "./menu-examples";

export const metadata: Metadata = { title: "Menu" };

export default function MenuPage() {
  return (
    <>
      <h1 className="mb-6 text-section">Menu</h1>
      <MenuExamples />
    </>
  );
}
