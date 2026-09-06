import type { Metadata } from "next";
import { TokensView } from "./tokens-view";

export const metadata: Metadata = { title: "Tokens" };

export default function TokensPage() {
  return (
    <>
      <h1 className="mb-6 text-section">Tokens</h1>
      <TokensView />
    </>
  );
}
