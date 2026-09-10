import type { Metadata } from "next";
import { PageFrame } from "../../../components/page-frame";
import { listApiKeys, listSecrets } from "../../../connections/server";
import { ConnectionsBrowser } from "./connections-browser";

export const metadata: Metadata = { title: "Connections · Automator" };

export default async function ConnectionsPage() {
  const [secrets, apiKeys] = await Promise.all([listSecrets(), listApiKeys()]);
  return (
    <PageFrame title="Connections">
      <ConnectionsBrowser secrets={secrets} apiKeys={apiKeys} />
    </PageFrame>
  );
}
