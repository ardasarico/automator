# Use Privy for dashboard authentication and wallets

Status: Accepted

## Context

The dashboard needs registration, sign-in, and an Ethereum wallet for each builder. Authentication should fit Automator's Coss interface and preserve the frontend-to-API-to-database boundary.

## Decision

- Use Privy for authentication and wallets in `apps/web`; runtime authentication is outside this scope.
- Provide one custom Coss screen for registration and sign-in through email OTP, Google, or an external Ethereum wallet. Use Privy's connector picker for external wallets and SIWE for authentication.
- Collect a display name and a unique username before granting workspace access.
- Create an embedded Ethereum wallet at first sign-in for every user, including external-wallet users.
- Keep profile persistence and token verification in the API. Only the API receives the Privy app secret and database credentials.

## Consequences

Privy owns authentication and token refresh. Same-origin web route handlers mirror the verified session into an HttpOnly cookie for server rendering. Private API handlers remain responsible for authorization, and PostgreSQL enforces username uniqueness.

The combined login screen replaces separate registration and login flows. Account linking, runtime authentication, and additional account-management features are not implied by this decision.
