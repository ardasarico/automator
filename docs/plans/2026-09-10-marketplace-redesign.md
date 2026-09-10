# Marketplace Redesign

> **Status:** implemented in `2a57df4`; `docs/web-ui.md` (Marketplace) describes what shipped. Do not re-execute this plan.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/marketplace` as a centred storefront that reads like a community, replacing today's flat grid of interchangeable cards.

**Spec:** this document. Marketplace was listed under "Still to design" in `docs/plans/2026-09-09-workspace-redesign.md`; this plan closes that entry.

**Comparison:** `apps/ui-lab/src/app/patterns/marketplace/` holds the mock the decisions came from. Task 8 deletes it.

## Why

The page has fifteen listings and no way to tell them apart. Five things cause that, and each has a fix in this plan:

1. **One flat grid, hard against the left edge.** Nothing carries weight; the eye has no entry point.
2. **The card does not show the flow.** Three generic node glyphs open every card, so fifteen cards share one silhouette — even though every listing has a stored document with real node positions.
3. **No people.** The author is a grey `@username` at the bottom. `DitherAvatar` has been in `packages/ui` since the workspace redesign and is unused here.
4. **Inconsistent signals.** Fork counts appear only on community listings; Automator's show nothing. Nothing says when anything was published.
5. **The catalog's shape is hidden.** Categories sit behind an `All categories` dropdown, so you cannot see what kind of thing lives here.

## Decisions

Settled with Arda over the UI Lab comparison. All three variants were built and judged in the browser.

- **Centred column, not full-bleed.** 1040 px, centred. The page carries **no title bar** and names itself in the column — the vocabulary Home already established (`apps/web/src/home/home.module.css`: `--text-page` title, centred subtitle, centred field).
- **The search field is the landing point.** 520 px, centred, under the subtitle — not a 240 px box crammed beside a heading.
- **Categories are visible**, as a centred chip row with counts. The `All categories` menu goes.
- **Row cards**, not thumbnail cards. The flow becomes an 80×56 tile and the words take the width. Both were built; row cards scan faster and fit more per screen. The graph survives as a silhouette — enough to tell a branch from a chain — but is no longer the thing you look at. That trade was made deliberately.
- **Community above Automator.** If the page claims to be a community, the community is what you see first.
- **One editorial pick** above the sections, chosen by us, not by an invented "trending" metric.
- **Fork appears on hover**, on the card's top-right. The resting card stays quiet; opening the listing is the primary act.
- **Only true signals.** Forks for a published flow, an `Example` badge for ours. No fabricated install or view counts.
- **Seed the community.** Arda approved seeding demo listings so the community section is not empty for the hackathon demo. They are clearly demo authors, not real Privy accounts.

### The shape

```
                     Marketplace                        ← --text-page, centred
        Flows shared by Automator and the community.
                Fork one to make it yours.

           ┌────────────────────────────────┐
           │ 🔍 Search flows, people and…   │           ← 520 px, centred
           └────────────────────────────────┘

   [All 15] [Mini-apps 7] [AI 4] [Onchain 6] [Logic 9]  ← counts, centred

   ┌────────────────────────────────────────────────┐
   │ FEATURED THIS WEEK          │                  │
   │ Proof-of-human airdrop      │   [flow graph]   │
   │ by Kerem Aydın   [Fork][Read it]               │
   └────────────────────────────────────────────────┘

   From the community  6                    See all →
   ┌──────────────────────┐ ┌──────────────────────┐
   │ ▤  Name              │ │ ▤  Name              │
   │    description       │ │    description       │
   │    (av) person   ⑂ 128│ │   (av) person   ⑂ 61 │
   └──────────────────────┘ └──────────────────────┘

   By Automator  9                          See all →
   ┌──────────────────────┐ ┌──────────────────────┐
   …
```

Searching, or picking a category or a "See all" scope, collapses the sections into one result list with a count and a sort menu. `browseListings` in `apps/web/src/marketplace/listing.ts` already does that filtering; only what triggers it changes.

## Architecture

The page stays a client component reading its state from the URL (`q`, `category`, `show`), as it does today, over listings loaded server-side by `listMarketplaceItems()`. Two things change underneath:

- **A listing gains an outline.** `documentOutline()` is already a pure function in `packages/contracts/src/flows.ts`, and `FlowMiniature` already renders one on Flows. Curated listings derive theirs locally from the document they carry; community listings need the API to send one, which means one additive field on `marketplaceListingSchema` and one column added to the `list()` query.
- **The scope filter becomes sections.** `All / By Automator / Community / Yours` stops being a segmented control. Automator and Community are sections; `Yours` becomes a section that appears only when you have published something; `All` is the default view. The `ListingFilter` type and `browseListings` survive unchanged — they now serve the catalog view that search and "See all" open.

**Boundary:** unchanged. `web → api → db`; no database access from `apps/web`.

## Out of scope

- **The listing detail page** (`/marketplace/[slug]`) beyond aligning its byline with the new author component. Its structure was not part of this review.
- **Author profile pages.** Avatars and names are not links yet; there is no `/u/[username]` route and this plan does not add one.
- **Sorting inside a section.** Sort lives in the catalog view only.
- **Narrow-viewport layout**, still out of scope in `docs/web-ui.md`.
- **Real fork counts on curated listings.** Nothing tracks forks of the bundled examples; they carry an `Example` badge instead of a fabricated number.

## Global constraints

- **Commits are gated.** `AGENTS.md` requires work to stay uncommitted until Arda asks. Each task ends by running checks and leaving the tree dirty — never `git commit`.
- **Contracts:** schemas live in `packages/contracts`, types are inferred, and both the API handler and the API client validate against the same schema.
- **Icons:** Remix Icons only, line variants by default.
- **Language:** English for all code, comments, docs and test names.
- **Formatting:** `bun run format` (oxfmt, not prettier) before checks.
- **Per task:** `bun run format && bun run lint && bun run typecheck && bun test <changed files>`. Full `bun run test` and `bun run build` before the plan is done.
- **Ask rather than invent.** This plan fixes structure, names and data. Spacing and weight choices inside the page are Arda's call at implementation time.

---

### Task 1: Carry the flow's outline on a listing

The card cannot draw a flow it has not been given. Curated listings already hold the document; community listings do not send one with the list.

**Files:**

- Modify: `packages/contracts/src/marketplace.ts`
- Modify: `packages/db/src/listings.ts`
- Modify: `apps/web/src/marketplace/listing.ts`, `apps/web/src/marketplace/curated.ts`
- Modify: `packages/db/src/listings.integration.test.ts`, `apps/api/src/marketplace/routes.test.ts`, `apps/web/src/marketplace/listing.test.ts`

**Interfaces:**

- Produces: `marketplaceListingSchema` gains `outline: flowOutlineSchema`; `MarketplaceItem` gains `outline: FlowOutline`.
- Consumes: `documentOutline`, `flowOutlineSchema` from `@automator/contracts`.

- [ ] **Step 1: Write the failing tests**

In `packages/db/src/listings.integration.test.ts`, assert `list()` returns an outline whose node ids and edges match the published document.

In `apps/web/src/marketplace/listing.test.ts`, assert `fromListing` carries the outline through and that every curated listing has a non-empty one.

- [ ] **Step 2: Add the contract field**

Add `outline: flowOutlineSchema` to `marketplaceListingSchema`. `marketplaceListingDetailSchema` spreads its properties, so the detail response gains it too.

- [ ] **Step 3: Serve it from the store**

In `packages/db/src/listings.ts`, add `l.document` to the `SELECT` in `list()` and `findByFlow()`, and map it through `documentOutline()` in `toListing`. The document is not returned — only the outline derived from it.

Check that `ListingRow` and `toListing` still type-check against `MarketplaceListing`.

- [ ] **Step 4: Carry it in the web model**

Add `outline: FlowOutline` to `MarketplaceItem`. In `fromListing`, pass the listing's own outline through. In `curated.ts`, derive it with `documentOutline(exampleToFlowDocument(...))`.

- [ ] **Step 5: Verify and hold**

Run: `bun run format && bun run lint && bun run typecheck && bun test packages/db packages/contracts apps/api apps/web/src/marketplace`
Expected: all pass. Leave uncommitted.

---

### Task 2: The listing card and its parts

Three components the page is built from. Building them first means Task 3 assembles rather than invents.

**Files:**

- Create: `apps/web/src/marketplace/listing-author.tsx`, `listing-author.test.tsx`
- Create: `apps/web/src/app/(workspace)/marketplace/listing-signal.tsx`
- Rewrite: `apps/web/src/app/(workspace)/marketplace/listing-card.tsx`
- Modify: `apps/web/src/app/(workspace)/marketplace/marketplace.module.css`
- Modify: `apps/web/src/flows/miniature-geometry.ts`, `miniature-geometry.test.ts`, `apps/web/src/app/(workspace)/flows/flow-examples.tsx`
- Move: `apps/web/src/app/(workspace)/marketplace/flow-node-marks.tsx` → `apps/web/src/app/(workspace)/flows/flow-node-marks.tsx`. Its only caller is `flows/flow-examples.tsx`; it stops being a marketplace component when the card no longer uses glyphs. Update that import.

**Interfaces:**

- Produces: `ListingAuthorLine({ author, size })`, `ListingSignal({ listing })`, `ListingCard({ listing })`.
- Consumes: `DitherAvatar` from `@automator/ui/dither-avatar`, `LogoMark` from `@automator/ui/logo`, `FlowMiniature` from `apps/web/src/flows/flow-miniature`.

- [ ] **Step 1: Write the failing tests**

`renderToString` a card for a community listing and assert it contains the author's name, the `@username`, the fork count, and an `svg` for the miniature. Render one for a curated listing and assert it says `Automator` and carries the `Example` badge rather than a fork count.

- [ ] **Step 2: The author line**

Two shapes behind one component: `DitherAvatar name={username}` plus `Name @username` for a user, `LogoMark` in a muted circle plus `Automator` for ours. `size` is a number so the featured block can ask for a larger one.

Note: `DitherAvatar` paints a canvas in an effect, so this component is client-side. Keep it out of any server component's direct return path.

- [ ] **Step 3: The signal**

Forks with `RiGitForkLine` for a user listing; a `secondary` `Badge` reading `Example` for a curated one. Nothing else — no invented metrics.

- [ ] **Step 4: The card**

The row shape: an 80×56 tile on the left holding `FlowMiniature`, then name, one-line description, and the author line with the signal pushed to the end. The whole card is a link to the listing via a `::after` overlay, as today's card already does, so the hover Fork button stays clickable above it.

The Fork button sits at the card's top-right, hidden until `:hover` / `:focus-within`, and must remain reachable by keyboard — use `opacity` plus `pointer-events`, never `display: none`, and let focus reveal it.

The miniature needs its own geometry at tile size. `miniatureGeometry` in `apps/web/src/flows/miniature-geometry.ts` closes over `miniatureView` (320×112, capped at `maxScale` 0.26) rather than taking it as an argument. Parameterise it — `miniatureGeometry(outline, view = miniatureView)` — and export a `tileView` alongside. Keeping the default means Flows, `FlowMiniature` and `miniature-geometry.test.ts` need no change; add a test for the tile view rather than editing the existing ones.

A tile that small cannot fit a wide flow at the card view's scale cap: the lab draft needed roughly 160×104 with the cap lifted before a six-node flow read as anything. Judge it in the browser before settling the numbers.

- [ ] **Step 5: Verify and hold**

Run: `bun run format && bun run lint && bun run typecheck && bun test apps/web/src/marketplace apps/web/src/app`
Expected: all pass. Leave uncommitted.

---

### Task 3: The centred page

**Files:**

- Rewrite: `apps/web/src/app/(workspace)/marketplace/marketplace-browser.tsx`, `marketplace.module.css`
- Create: `apps/web/src/app/(workspace)/marketplace/featured-listing.tsx`
- Modify: `apps/web/src/marketplace/curated.ts` (the featured pick)
- Modify: `apps/web/src/marketplace/listing.ts` (section split, featured resolution)
- Modify: `apps/web/src/marketplace/listing.test.ts`

**Interfaces:**

- Produces: `featuredListing(listings)`, `listingSections(listings, username)`; `FeaturedListing({ listing })`.
- Consumes: everything from Task 2, `browseListings` unchanged.

- [ ] **Step 1: Write the failing tests**

`featuredListing` returns the listing matching the first available slug in a curated `featuredSlugs` list, and falls back to the first curated listing when none of them are published. `listingSections` returns `Yours` only when the viewer has listings, and orders the sections Yours → Community → Automator, with the featured listing excluded from the section it would otherwise appear in.

- [ ] **Step 2: The featured pick**

A `featuredSlugs: readonly string[]` in `curated.ts`, resolved at render against the loaded listings. A community listing may be featured, so the slug may be absent — the fallback is not optional.

- [ ] **Step 3: The page head**

No `PageFrame`. A centred header: `--text-page` title, subtitle, the 520 px search field bound to `q` (still `replaceState`, so typing does not fill the history stack), then the category chips with counts bound to `category` (`pushState` — a category is a step worth going back from).

Counts come from `listingCategories`; a category with no listings is still shown, at zero, so the taxonomy does not flicker as the catalog changes.

The chip row is a `role="group"` of toggle buttons, not links. Keep the current `aria-pressed` pattern.

- [ ] **Step 4: The sections and the catalog view**

Default view: featured, then each section as a heading with its count and a "See all" that sets `show`.

Catalog view — entered when `q` is non-empty, `category` is set, or `show` is set: one list, a count line, the sort menu, and the existing empty states. `browseListings` does the work unchanged.

Keep the `role="status"` count announcement that exists today.

- [ ] **Step 5: The empty community**

If no community listings exist, the section is an invitation, not an empty state: a line saying nobody has published yet and the publish action from Task 4. Do not render a sad illustration for a section that is expected to fill.

- [ ] **Step 6: Verify and hold**

Run: `bun run format && bun run lint && bun run typecheck && bun test apps/web`
Expected: all pass. Leave uncommitted.

---

### Task 4: A publish entry point

Publishing is reachable only from inside the builder today, which is the wrong shape for a page that asks people to contribute. **Confirm with Arda before building this one** — it is the one part of the plan that adds behaviour rather than reshaping what exists.

**Files:**

- Modify: `apps/web/src/app/(workspace)/marketplace/page.tsx` (load the viewer's flows)
- Modify: `apps/web/src/app/(workspace)/marketplace/marketplace-browser.tsx`
- Modify: `apps/web/src/builder/builder-dialogs.tsx`

**Interfaces:**

- Consumes: `listFlows()` from `apps/web/src/flows/server`.
- Produces: no new exports. The builder honours `?publish=1`.

- [ ] **Step 1: The picker**

A `Publish a flow` button in the page's top-right corner — outside the centred column, since it is not part of what the column says. It opens a `Menu` of the viewer's flows; picking one navigates to `/flows/<id>?publish=1`.

With no flows, the menu is replaced by a link to `/flows` — there is nothing to publish yet.

- [ ] **Step 2: The builder honours the parameter**

In `builder-dialogs.tsx`, open the `listing` dialog on mount when the URL carries `publish=1`, then strip the parameter with `replaceState` so a reload does not reopen it. Follow the pattern `HomePrompt` uses for `?draft`.

- [ ] **Step 3: Verify and hold**

Run: `bun run format && bun run lint && bun run typecheck && bun test apps/web`
Expected: all pass. Leave uncommitted.

---

### Task 5: Seed the community

Six demo listings so the community section is populated for the hackathon demo. They are demo authors, not Privy accounts, and the script says so.

**Files:**

- Create: `apps/api/scripts/seed-marketplace.ts`
- Modify: `apps/api/package.json` (a `seed:marketplace` script)
- Modify: `docs/architecture.md` if it lists the API's scripts

**Interfaces:**

- Consumes: `@automator/db` stores directly. This is an operator script run against `DATABASE_URL`, not an API route.

- [ ] **Step 1: Decide the six**

Take the fixtures from `apps/ui-lab/src/app/patterns/marketplace/fixtures.ts` as the starting set — they were written against the real node catalog and reviewed in the mock. Each needs a name, a description under 280 characters, an author name and username matching `^[a-z][a-z0-9_]{2,23}$`, and a document built from real node types.

- [ ] **Step 2: Write the script**

For each: upsert a user with a `did:seed:<username>` id, insert a flow owned by them, then a listing. Idempotent — running it twice must not duplicate or fail. It must refuse to run unless an explicit `--yes` flag is passed, because it writes to whatever `DATABASE_URL` points at.

Fork counts are set directly, so the numbers on the cards are the ones we chose rather than a claim about real usage.

- [ ] **Step 3: Run it against the local database**

Run: `bun run --cwd apps/api seed:marketplace -- --yes` against the local test database, then load `/marketplace` and confirm six community listings with drawn miniatures.

Do **not** run it against Railway without asking Arda first.

- [ ] **Step 4: Verify and hold**

Run: `bun run format && bun run lint && bun run typecheck`
Expected: all pass. Leave uncommitted.

---

### Task 6: Align the detail page byline

The listing page shows `By Name @username` as plain text. It should use the same author component, so the person is the same person on both pages.

**Files:**

- Modify: `apps/web/src/app/(workspace)/marketplace/[slug]/page.tsx`

- [ ] **Step 1: Replace `ListingByline`'s inner markup**

Use `ListingAuthorLine` for the person, and keep the date and fork count beside it. The page keeps `PageFrame` — only the marketplace index loses its title bar.

- [ ] **Step 2: Verify and hold**

Run: `bun run format && bun run lint && bun run typecheck && bun test apps/web`
Expected: all pass. Leave uncommitted.

---

### Task 7: Fix the end-to-end suite

`apps/web/e2e/demo-path.e2e.ts:52` clicks `getByRole("button", { name: "Yours" })` on `/marketplace`. That control no longer exists — `Yours` is a section now.

**Files:**

- Modify: `apps/web/e2e/demo-path.e2e.ts`

- [ ] **Step 1: Update the assertion**

Replace the button click with an assertion that the freshly published flow appears under the `Yours` section heading. If the section is reachable only through "See all", follow that link instead.

- [ ] **Step 2: Run the suite**

Run: `bun run --cwd apps/web e2e`
Expected: the two known pre-existing failures and nothing else. Record which two, so a third is not mistaken for one of them.

---

### Task 8: Remove the draft

**Files:**

- Delete: `apps/ui-lab/src/app/patterns/marketplace/`
- Modify: `apps/ui-lab/src/components/lab-shell.tsx` (drop the `Marketplace (redesign)` entry)
- Modify: `docs/plans/2026-09-09-workspace-redesign.md` (remove Marketplace from "Still to design")

- [ ] **Step 1: Delete and de-register**

```bash
rm -r apps/ui-lab/src/app/patterns/marketplace
```

Then remove the nav entry and confirm `grep -rn "patterns/marketplace" apps` is empty.

- [ ] **Step 2: Full verification**

Run: `bun run format && bun run lint && bun run typecheck && bun run test && bun run build`
Expected: all pass. Leave uncommitted, and report what passed and what stayed unverified.

---

## Open questions

- **Task 4** adds a publish entry point rather than reshaping something that exists. Confirm before building it.
- **The seeded authors** carry `did:seed:*` ids. If Arda would rather they be real accounts, Task 5 changes shape.
