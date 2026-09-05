import { ThemeSelect } from "@automator/ui/theme-select";
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 p-8">
      <h1 className="text-page text-balance">Automator Apps</h1>
      <p className="text-pretty text-muted-foreground">Open a shared app link to get started.</p>
      <div>
        <ThemeSelect />
      </div>
    </main>
  );
}
