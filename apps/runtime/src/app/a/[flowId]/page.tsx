import { request } from "@automator/api-client/server";
import { getPublicFlowContract, type PublicFlow } from "@automator/contracts";
import type { Metadata } from "next";
import { PreviewMiniApp } from "./preview-mini-app";
import { PublishedMiniApp } from "./published-mini-app";
import { NotFoundNotice } from "./shell";
import { resolveRuntimeSource } from "./source";

type Props = {
  params: Promise<{ flowId: string }>;
  searchParams: Promise<{ preview?: string }>;
};

async function loadPublishedFlow(id: string): Promise<PublicFlow | null> {
  try {
    const result = await request(process.env.API_URL, getPublicFlowContract, { params: { id } });
    return result.status === 200 ? result.data : null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const flow = await loadPublishedFlow((await params).flowId);
  return { title: flow ? `${flow.name} · Automator Apps` : "Automator Apps" };
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
