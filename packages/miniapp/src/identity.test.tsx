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

  test("with host actions the preview note goes away and World App copy applies", () => {
    const html = renderToStaticMarkup(
      <IdentityActionsProvider
        actions={{
          inWorldApp: true,
          privyLogin: async () => ({ privyToken: "t" }),
          worldVerify: async () => ({
            worldProof: {
              merkle_root: "1",
              nullifier_hash: "2",
              proof: "3",
              verification_level: "orb",
            },
          }),
        }}
      >
        <MiniApp document={document} startAt="verify" />
      </IdentityActionsProvider>,
    );
    expect(html).not.toContain("data-preview");
    expect(html).not.toContain("scan the code");
    expect(html).toContain("Proves you are a unique human");
  });

  test("a missing action is called out only when a real verification would run", () => {
    const missing = { ...document, nodes: document.nodes.map((n) => ({ ...n, config: {} })) };
    const preview = renderToStaticMarkup(<MiniApp document={missing} startAt="verify" />);
    expect(preview).not.toContain("no World action configured");
    const real = renderToStaticMarkup(
      <IdentityActionsProvider actions={{ worldVerify: async () => ({ worldProof: {} as never }) }}>
        <MiniApp document={missing} startAt="verify" />
      </IdentityActionsProvider>,
    );
    expect(real).toContain("no World action configured");
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
