import { getHealth } from "@automator/api-client/server";
import { Button } from "@automator/ui/button";

export const dynamic = "force-dynamic";

const labels = {
  up: "Connected",
  down: "Unavailable",
  not_configured: "Not configured",
  unknown: "Not checked",
};

export default async function Home() {
  const health = await getHealth(process.env.API_URL);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-8 p-8">
      <header className="space-y-2">
        <h1 className="font-semibold">Automator</h1>
        <p className="opacity-60">System health</p>
      </header>

      <dl className="divide-y border-y">
        <div className="flex items-center justify-between gap-4 py-5">
          <dt>Backend</dt>
          <dd className="font-medium">{labels[health.backend]}</dd>
        </div>
        <div className="flex items-center justify-between gap-4 py-5">
          <dt>Database</dt>
          <dd className="font-medium">{labels[health.database]}</dd>
        </div>
      </dl>

      <form action="/" method="get">
        <Button type="submit">Check again</Button>
      </form>
    </main>
  );
}
