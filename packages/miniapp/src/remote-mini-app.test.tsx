import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  RemoteMiniApp,
  signInRefusedNotice,
  stateAfterFailure,
  type MiniAppClient,
} from "./remote-mini-app";
import { VisitorFailedView } from "./screens";

describe("VisitorFailedView", () => {
  test("shows the sentence, the owner's note and Try again, and nothing technical", () => {
    const html = renderToStaticMarkup(
      <VisitorFailedView
        message="This app hit a problem and could not continue."
        help="Contact @ada on Telegram"
        code="node_failed"
        onRetry={() => {}}
      />,
    );
    expect(html).toContain("Something went wrong");
    expect(html).toContain("This app hit a problem and could not continue.");
    expect(html).toContain("Contact @ada on Telegram");
    expect(html).toContain(">Try again<");
    expect(html).toContain('data-failure="node_failed"');
    expect(html).not.toContain("failed:");
  });

  test("without a note or a code it is the unreachable-API screen", () => {
    const html = renderToStaticMarkup(
      <VisitorFailedView message="The app could not be reached. Try again." onRetry={() => {}} />,
    );
    expect(html).toContain('data-failure="unavailable"');
    expect(html).toContain("The app could not be reached. Try again.");
  });
});

describe("RemoteMiniApp", () => {
  test("opens on the working view under the app's name while the session starts", () => {
    const client: MiniAppClient = {
      start: () => new Promise(() => {}),
      answer: () => new Promise(() => {}),
    };
    const html = renderToStaticMarkup(<RemoteMiniApp client={client} name="Tickets" />);
    expect(html).toContain('data-session="loading"');
    expect(html).toContain("Tickets");
    expect(html).toContain("One moment");
  });
});

describe("stateAfterFailure", () => {
  const session = {
    sessionId: "s1",
    status: "screen" as const,
    steps: [],
    screen: { nodeId: "login", type: "privy.login" as const, label: "Sign in", config: {} },
  };
  const previous = { kind: "session" as const, session, token: "tok" };

  test("a rejected sign-in keeps the session on its screen with a note", () => {
    expect(stateAfterFailure(new Error("unauthorized"), previous)).toEqual({
      ...previous,
      notice: signInRefusedNotice,
    });
  });

  test.each([
    ["payment_pending", "That payment has not landed on the network yet. Try again in a moment."],
    ["payment_used", "That payment has already been used. Pay again to continue."],
    ["payment_rejected", "That payment did not match what this app asked for. Try again."],
  ])("a %s answer keeps the payment screen answerable", (code, notice) => {
    expect(stateAfterFailure(new Error(code), previous)).toEqual({ ...previous, notice });
  });

  test("anything else, or a rejection without a session to return to, is unavailable", () => {
    expect(stateAfterFailure(new Error("rate_limited"), previous)).toEqual({
      kind: "unavailable",
      message: "Too many requests right now. Wait a moment and try again.",
    });
    expect(stateAfterFailure(new Error("unauthorized"), undefined).kind).toBe("unavailable");
    expect(stateAfterFailure(new TypeError("fetch failed"), previous)).toEqual({
      kind: "unavailable",
      message: "The app could not be reached. Try again.",
    });
  });
});
