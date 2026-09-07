import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RemoteMiniApp, type MiniAppClient } from "./remote-mini-app";
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
