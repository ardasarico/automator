import { request } from "@automator/api-client/server";
import { getPublicFlowContract, type PublicFlow } from "@automator/contracts";
import type { Metadata } from "next";
import { cache } from "react";
import { runtimeDescription, runtimeImage, runtimeTitle } from "../../meta";
import { PreviewMiniApp } from "./preview-mini-app";
import { PublishedMiniApp } from "./published-mini-app";
import { NotFoundNotice } from "./shell";
import { resolveRuntimeSource } from "./source";

type Props = {
  params: Promise<{ flowId: string }>;
  searchParams: Promise<{ preview?: string }>;
};

/* The metadata and the page both need the flow in the same pass: cache() keeps that one request. */
const loadPublishedFlow = cache(async (id: string): Promise<PublicFlow | null> => {
  try {
    const result = await request(process.env.API_URL, getPublicFlowContract, { params: { id } });
    return result.status === 200 ? result.data : null;
  } catch {
    return null;
  }
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const flow = await loadPublishedFlow((await params).flowId);
  const title = flow ? `${flow.name} · ${runtimeTitle}` : runtimeTitle;
  const description = flow
    ? flow.description.trim() || `${flow.name}, a mini-app built with Automator.`
    : runtimeDescription;
  return {
    title,
    description,
    openGraph: {
      type: "website",
      siteName: "Automator",
      title,
      description,
      images: [runtimeImage],
    },
  };
}

export default async function MiniAppPage({ params, searchParams }: Props) {
  const { flowId } = await params;
  const hasPreviewFlag = (await searchParams).preview !== undefined;
  const flow = hasPreviewFlag ? null : await loadPublishedFlow(flowId);
  const source = resolveRuntimeSource({ hasPreviewFlag, published: flow ? true : null });
  if (source === "preview")
    return (
      <PreviewMiniApp
        flowId={flowId}
        builderUrl={
          process.env.WEB_URL ??
          (process.env.NODE_ENV === "development" ? "http://localhost:3000" : undefined)
        }
      />
    );
  if (!flow) return <NotFoundNotice />;
  return <PublishedMiniApp flowId={flow.id} name={flow.name} />;
}
