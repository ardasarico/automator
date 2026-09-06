import { Button } from "@automator/ui/button";
import { RiGitForkLine } from "@remixicon/react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkspaceBreadcrumbs } from "../../../../components/workspace-breadcrumbs";
import { flowExamples } from "../examples";
import { FlowNodeMarks } from "../flow-node-marks";

type Props = { params: Promise<{ slug: string }> };

function findExample(slug: string) {
  const example = flowExamples.find((item) => item.id === slug);
  if (!example) notFound();
  return example;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const example = findExample((await params).slug);
  return {
    title: `${example.name} · Marketplace · Automator`,
    description: example.description,
  };
}

export default async function FlowDetailPage({ params }: Props) {
  const example = findExample((await params).slug);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pt-2 pb-12 sm:px-8">
      <WorkspaceBreadcrumbs
        parents={[{ label: "Marketplace", href: "/marketplace" }]}
        current={example.name}
      />
      <header className="mt-8 border-b pb-8">
        <FlowNodeMarks nodes={example.nodes} />
        <div className="mt-5 flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0 flex-1 basis-64">
            <p className="mb-2 text-caption text-muted-foreground">By Automator</p>
            <p className="max-w-lg text-body text-pretty text-muted-foreground">
              {example.description}
            </p>
          </div>
          <Button
            render={<Link href={`/create?example=${example.id}`} />}
            aria-label={`Fork flow: ${example.name}`}
          >
            <RiGitForkLine aria-hidden="true" />
            Fork flow
          </Button>
        </div>
      </header>
      <section className="mt-8" aria-labelledby="flow-steps-title">
        <h2 id="flow-steps-title" className="text-section">
          How it works
        </h2>
        <ol className="mt-6 space-y-6">
          {example.steps.map((step, index) => (
            <li key={step.name} className="flex gap-4">
              <span
                className="pt-0.5 font-mono text-caption text-muted-foreground"
                aria-hidden="true"
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <h3 className="text-label">{step.name}</h3>
                <p className="mt-1 max-w-lg text-body text-muted-foreground">{step.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
