import type { Metadata } from "next";
import { PageFrame } from "../../../components/page-frame";
import { listSecrets } from "../../../connections/server";
import { ConnectionsBrowser } from "./connections-browser";

export const metadata: Metadata = { title: "Connections · Automator" };

export default async function ConnectionsPage() {
  const secrets = await listSecrets();
  return (
    <PageFrame title="Connections">
      <ConnectionsBrowser secrets={secrets} />
    </PageFrame>
  );
}
