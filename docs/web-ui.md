# Web workspace UI

Screen-level behaviour for `apps/web`'s `(workspace)` route group. See `docs/architecture.md` for the app's place in the system.

## Shell and navigation

The sidebar and content layout are adapted from `arda.chat`: a fixed 260 px header inside a sidebar that springs between 260 and 64 px. That JavaScript width spring is the only animated value left; the surrounding content padding, top corner radius, and label opacities are CSS transitions keyed on the shell's state. A single `<Link aria-label="Automator flows">` carries both the mark and the wordmark and stays mounted across states, with the expand control positioned over it when collapsed. Flows, Runs, and Marketplace appear in the main navigation, each with a tooltip when the sidebar is collapsed. The root route (`/`) redirects to `/flows`, the workspace entry page. Sidebar state is restored server-side from a cookie through shared preference-cookie helpers (`apps/web/src/lib/preferences*`); Cmd/Ctrl+Shift+S, registered through a shared hotkey registry (`apps/web/src/lib/hotkeys.ts`), toggles it. A skip link precedes the shell for keyboard users. Reduced-motion preferences disable the layout animations. Links use the shared theme and Remix icons. The workspace shell has no dedicated narrow-viewport mode yet; mobile layout is out of scope for the current milestone.

Each workspace page's title renders as an `<h1>` beside a breadcrumb trail to its parents. Pages render in one of two content modes: the default `document` mode centers and caps page content, while a nested `(canvas)` route group opts a subtree into `fill` mode, which drops padding so the page occupies the full panel. `/flows/[id]` is the canonical flow URL and the first page in `fill` mode; it currently shows a placeholder panel pending the builder canvas. The workspace route group has shared `loading`, `error`, and `not-found` boundaries.

## Account menu and settings

The bottom account menu opens a responsive Settings dialog with Preferences, Connected apps, Usage, and Account sections. Theme selection works; app connections and usage tracking show unavailable states. Usage limits and reset times are not yet configured or enforced. The tab list is vertical on desktop and horizontally scrollable on mobile, with keyboard navigation and focus restoration to the account trigger. The Account section reads the session directly and shows the profile name, username, and embedded wallet address with a copy-to-clipboard control. Log out clears the web session cookie first and only ends the Privy session once that succeeds. Its Dither Kit avatar is vendored in the shared UI package.

## Flows

Flow creation is available in the Flows header and empty state. Flows (`/flows`) has a responsive empty state with the shared icon illustration and four simple curated flow cards with node icons and integration logos, a short description, Automator attribution, and a Fork flow button; each card opens a `/marketplace/[slug]` detail page. Its presentation component accepts `FlowSummary` records (id, name, description, updated time) from `packages/contracts` and supports labeled grid/table view controls, name search, and sorting; the view preference is restored from a cookie. Flow cards and the flow table show only a name and last-edited date, since the contract carries no status or step outline yet. The page currently supplies an empty list because flow persistence and its API are not implemented.

## Marketplace

`/marketplace/[slug]` detail pages show a step overview for each curated example; unknown slugs return not-found. The `/marketplace` index itself is an unavailable panel until browsing lands there, so the example cards live on the Flows page instead. Creation and fork links target the existing `/create` placeholder; fork links include an `example` query parameter for future builder integration.

## Placeholders and dev tooling

`/create`, `/runs`, `/marketplace`, and `/flows/[id]` show a shared unavailable panel (icon, heading, description, and a link back to `/flows`) instead of an empty body, pending feature implementation. There is no dedicated `/settings` route; the Settings dialog is the only entry point. The workspace shell does not fetch API health to render itself. Agentation is available in development only, using the same local annotation setup as UI Lab.
