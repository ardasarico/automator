"use client";

import { useSyncExternalStore } from "react";
import { BuiltWithFeeling } from "../../build/built-with-feeling";
import { BuiltWithMap } from "../../build/built-with-map";
import { BuiltWithProof } from "../../build/built-with-proof";
import { ThemeToggle } from "../../footer/theme-toggle";

/* Throwaway: three candidate "Built with" sections and a switcher. Deleted before anything ships. */

const options = [
  {
    key: "a",
    name: "A · Proof",
    answer:
      "The section is proof: one real run, in the product's run panel, with each partner where it is used.",
    section: <BuiltWithProof />,
  },
  {
    key: "b",
    name: "B · Map",
    answer:
      "The section is a map: the canvas cut into five layers a flow stands on, each carrying its nodes.",
    section: <BuiltWithMap />,
  },
  {
    key: "c",
    name: "C · Feeling",
    answer:
      "The section is a feeling: six sentences in the statement's voice, each verb a product pill.",
    section: <BuiltWithFeeling />,
  },
] as const;

type Key = (typeof options)[number]["key"];

const subscribe = (onChange: () => void) => {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
};
const readHash = () => window.location.hash.replace("#", "");
const serverHash = () => "";

export default function PreviewPage() {
  const hash = useSyncExternalStore(subscribe, readHash, serverHash);
  const current: Key = options.some((option) => option.key === hash) ? (hash as Key) : "a";
  const option = options.find((item) => item.key === current) ?? options[0];
  return (
    <main className="min-h-svh">
      <div className="pointer-events-none fixed inset-x-0 top-0 z-20 flex justify-center px-4 pt-4">
        <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-border bg-[color-mix(in_srgb,var(--background)_72%,transparent)] p-1 backdrop-blur-lg">
          {options.map(({ key, name }) => (
            <a
              key={key}
              href={`#${key}`}
              aria-current={key === current ? "true" : undefined}
              className="rounded-full px-3 py-1 text-caption text-muted-foreground transition-colors aria-[current]:bg-accent aria-[current]:text-foreground hover:text-foreground"
            >
              {name}
            </a>
          ))}
          <ThemeToggle />
        </div>
      </div>
      <p className="mx-auto max-w-[60ch] px-6 pt-24 text-center text-caption text-muted-foreground">
        {option.answer}
      </p>
      {option.section}
      <div className="border-border border-t" aria-hidden="true" />
    </main>
  );
}
