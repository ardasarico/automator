import type { FlowDocument, FlowNode } from "@automator/contracts";
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { IdentityActionsProvider } from "./identity";
import { MiniApp } from "./mini-app";
import { describeUnavailable } from "./remote-mini-app";

function node(id: string, type: FlowNode["type"], label: string, config = {}): FlowNode {
  return { id, type, position: { x: 0, y: 0 }, label, config };
}

const document: FlowDocument = {
  version: 1,
  id: "f",
  name: "Claim",
  description: "",
  nodes: [
    node("t", "trigger.miniapp-open", "Mini-app opened"),
    node("login", "privy.login", "Sign in", {
      message: "We need to know who you are.",
      methods: ["email", "passkey"],
      simulate: { email: "ada@example.com" },
    }),
    node("verify", "world.id-verify", "Prove personhood", {
      action: "claim",
      verificationLevel: "orb",
      button: "Verify",
    }),
    node("rejected", "world.id-verify", "Simulated rejection", { simulate: "rejected" }),
  ],
  edges: [
    { id: "1", source: "t", target: "login", sourceHandle: "visitor" },
    { id: "2", source: "login", target: "verify", sourceHandle: "user" },
  ],
};

describe("identity screens", () => {
  test("the Privy login renders its copy, the methods, and the preview note without a host", () => {
    const html = renderToStaticMarkup(<MiniApp document={document} startAt="login" />);
    expect(html).toContain("Sign in");
    expect(html).toContain("We need to know who you are.");
    expect(html).toContain("Sign in with Privy: Email, Passkey.");
    expect(html).toContain('data-preview="privy.login"');
    expect(html).toContain("Preview: continues as ada@example.com.");
  });

  test("the World ID check names the level and the branch the preview takes", () => {
    const html = renderToStaticMarkup(<MiniApp document={document} startAt="verify" />);
    expect(html).toContain("Prove personhood");
    expect(html).toContain(">Verify<");
    expect(html).toContain("Orb-verified World ID");
    expect(html).toContain("scan the code with World App");
    expect(html).toContain("Preview: continues as verified.");
    const rejected = renderToStaticMarkup(<MiniApp document={document} startAt="rejected" />);
    expect(rejected).toContain("Preview: continues as rejected.");
  });

  const hostActions = {
    inWorldApp: true,
    privyLogin: async () => ({ privyToken: "t" }),
    worldVerify: async () => ({
      worldProof: { protocol_version: "4.0", nonce: "0x1", action: "claim", responses: [{}] },
    }),
  };

  test("with host actions the preview note goes away and World App copy applies", () => {
    const html = renderToStaticMarkup(
      <IdentityActionsProvider actions={hostActions}>
        <MiniApp document={document} startAt="verify" />
      </IdentityActionsProvider>,
    );
    expect(html).not.toContain("data-preview");
    expect(html).not.toContain("scan the code");
    expect(html).toContain("Proves you are a unique human");
  });

  test("a missing action or World setup is called out only when a real verification would run", () => {
    const missing = { ...document, nodes: document.nodes.map((n) => ({ ...n, config: {} })) };
    const preview = renderToStaticMarkup(<MiniApp document={missing} startAt="verify" />);
    expect(preview).not.toContain("no World action configured");
    const noAction = renderToStaticMarkup(
      <IdentityActionsProvider actions={hostActions}>
        <MiniApp document={missing} startAt="verify" />
      </IdentityActionsProvider>,
    );
    expect(noAction).toContain("no World action configured");
    expect(noAction).toContain("disabled");
    // An action without a request context means the API has no World configuration.
    const notSetUp = renderToStaticMarkup(
      <IdentityActionsProvider actions={hostActions}>
        <MiniApp document={document} startAt="verify" />
      </IdentityActionsProvider>,
    );
    expect(notSetUp).toContain("World ID is not set up for this app yet.");
  });
});

describe("describeUnavailable", () => {
  test("tells a rejected sign-in apart from an unreachable app", () => {
    expect(describeUnavailable(new Error("unauthorized"))).toContain(
      "sign-in could not be verified",
    );
    expect(describeUnavailable(new Error("unavailable"))).toContain("could not be reached");
    expect(describeUnavailable(new TypeError("fetch failed"))).toContain("could not be reached");
  });
});
