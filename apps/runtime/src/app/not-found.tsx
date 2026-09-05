export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 p-8">
      <h1 className="text-page text-balance">App not found</h1>
      <p className="text-pretty text-muted-foreground">
        Check the link or ask the person who shared it with you.
      </p>
    </main>
  );
}
