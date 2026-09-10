/*
 * Public URL of the API; inlined at build time, so it cannot be read dynamically.
 *
 * `API_URL` is the server-only address the web app calls, and on Railway that is the API's private
 * domain, which nothing outside the project can reach. Anything a person copies into a tool of
 * their own needs this separate public one.
 */
export const publicApiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
