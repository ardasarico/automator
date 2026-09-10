# Settle the workspace pages on one page vocabulary

Status: Accepted

## Context

The workspace redesign gave Home, Flows, Runs and Data a shared shell and a `PageFrame`, but the pages that came later were left behind: Wallet stacked cards of its own invention, login and onboarding floated on a different ground from the app they lead into, account settings lived in a dialog that could not be linked to or deep-linked into, every page wrote its own empty state, and a Mini-apps entry in the sidebar led to a placeholder. The result read as several products sharing a sidebar.

## Decision

- **Settings is a page, not a dialog.** `/settings` sits on the frame in the Connections column width with Preferences, Usage and Account as stacked sections; the account menu item and the sidebar footer row are both links to it. A settings screen that can be linked to, reloaded and shared is worth more than one that opens over whatever the reader was doing.
- **One empty state.** `EmptyState` is the single component behind every empty, filtered-out and unavailable state on a workspace page, with variants for a section's first run, a panel that owns its region, and a state nested under an existing heading. Builder panels and the Home tape keep their one-line notes: those are marks inside a working surface, not pages.
- **The remaining pages adopt the frame vocabulary.** Wallet becomes one reading column on the frame; login and onboarding stand on the workspace ground so the app does not change character at the door; the app gains a root `not-found` page.
- **Mini-apps is removed rather than left as a placeholder.** A sidebar entry that leads nowhere teaches the reader that entries may lead nowhere. Mini apps are reached from the flow that publishes them.

## Consequences

A page is now assembled from a known vocabulary — frame, empty state, column width — so the next one is a matter of choosing from it rather than inventing. Anything that wants a settings surface has a URL to link to. The account settings dialog is gone, so its one caller had to move to the page; the flow settings dialog in the builder is a different thing and stays. Removing the Mini-apps route drops the only navigation entry that did nothing, at the cost of there being no single list of an account's published apps until a real one exists.
