import Image from "next/image";
import type { flowExamples } from "../marketplace/examples";

export function FlowNodeMarks({ nodes }: { nodes: (typeof flowExamples)[number]["nodes"] }) {
  return (
    <div className="flex gap-2">
      {nodes.map((node) => (
        <span
          key={node.name}
          title={node.name}
          className="flex size-7 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground"
        >
          {"logo" in node ? (
            <Image
              src={`/integrations/${node.logo}.svg`}
              alt={node.name}
              width={28}
              height={28}
              className={node.logo === "world" ? "rounded bg-white" : undefined}
            />
          ) : (
            <node.icon role="img" aria-label={node.name} className="size-4" />
          )}
        </span>
      ))}
    </div>
  );
}
