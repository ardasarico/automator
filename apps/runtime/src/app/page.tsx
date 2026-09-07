import { ThemeSelect } from "@automator/ui/theme-select";

/**
 * The runtime's front door. Visitors only ever arrive here by trimming a shared link, so the
 * page explains what those links are and points them back to whoever shared one.
 */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 p-8">
      <div>
        <h1 className="text-page text-balance">Automator Apps</h1>
        <p className="mt-3 text-pretty text-muted-foreground">
          This is where mini-apps built with Automator run. There is nothing to browse here: each
          app has its own link, shared by the person who built it.
        </p>
      </div>
      <section aria-labelledby="what-is-a-link">
        <h2 id="what-is-a-link" className="text-section">
          What a mini-app link is
        </h2>
        <ul className="mt-3 flex flex-col gap-2 text-pretty text-muted-foreground">
          <li>
            A link like <code className="font-mono text-foreground">/a/…</code> opens one flow as a
            small web app: a sequence of screens such as forms, confirmations and QR codes.
          </li>
          <li>
            Each button you press picks the next step. Between screens the flow may run its own
            logic, post to a chat, or move tokens, as designed by its builder.
          </li>
          <li>
            The app belongs to whoever built it. Automator hosts it but does not review or endorse
            it, so share only what you would share with them.
          </li>
        </ul>
      </section>
      <p className="text-caption text-muted-foreground">
        Got here by accident? Ask the person who sent you the link to send it again, or build your
        own flow in the Automator dashboard.
      </p>
      <div>
        <ThemeSelect />
      </div>
    </main>
  );
}
