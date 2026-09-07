import { describe, expect, test } from "bun:test";
import {
  isScreenNodeType,
  parseScreenConfig,
  screenConfigSchemas,
  screenNodeTypes,
  screenPorts,
  type ScreenFormConfig,
} from "./screens";

describe("screen node types", () => {
  test("cover every screen.* id plus the identity screens and nothing else", () => {
    expect(screenNodeTypes).toEqual([
      "screen.page",
      "screen.form",
      "screen.confirmation",
      "screen.qr-code",
      "privy.login",
      "world.id-verify",
    ]);
    expect(isScreenNodeType("screen.form")).toBe(true);
    expect(isScreenNodeType("privy.login")).toBe(true);
    expect(isScreenNodeType("world.id-verify")).toBe(true);
    expect(isScreenNodeType("world.verification-completed")).toBe(false);
    expect(isScreenNodeType("logic.condition")).toBe(false);
    expect(Object.keys(screenConfigSchemas)).toEqual([...screenNodeTypes]);
  });
});

describe("parseScreenConfig", () => {
  test("fills every field of an empty config with its default", () => {
    expect(parseScreenConfig("screen.page", {})).toEqual({
      title: "",
      body: "",
      button: "Continue",
    });
    expect(parseScreenConfig("screen.form", {})).toEqual({
      title: "",
      description: "",
      fields: [],
      submit: "Submit",
    });
    expect(parseScreenConfig("screen.confirmation", {})).toEqual({
      title: "",
      message: "",
      confirm: "Confirm",
      cancel: "Cancel",
      simulate: "confirmed",
    });
    expect(parseScreenConfig("screen.qr-code", {})).toEqual({
      title: "",
      value: "",
      caption: "",
      button: "Continue",
    });
  });

  test("keeps provided values and defaults the rest", () => {
    const config = parseScreenConfig("screen.form", {
      title: "Your details",
      fields: [{ id: "email", label: "Email", type: "email" }],
    });
    const expected: ScreenFormConfig = {
      title: "Your details",
      description: "",
      fields: [
        {
          id: "email",
          label: "Email",
          type: "email",
          placeholder: "",
          required: false,
          sample: "",
        },
      ],
      submit: "Submit",
    };
    expect(config).toEqual(expected);
  });

  test("drops unknown keys and repairs wrong types instead of throwing", () => {
    expect(parseScreenConfig("screen.page", { title: 42, extra: true, button: null })).toEqual({
      title: "",
      body: "",
      button: "Continue",
    });
    const form = parseScreenConfig("screen.form", { fields: "nope" });
    expect(form.fields).toEqual([]);
  });

  test("does not mutate the input", () => {
    const input = { title: "Hello" };
    parseScreenConfig("screen.page", input);
    expect(input).toEqual({ title: "Hello" });
  });
});

describe("screenPorts", () => {
  test("names the port each visitor action continues on", () => {
    expect(screenPorts("screen.page")).toEqual({ primary: "next" });
    expect(screenPorts("screen.form")).toEqual({ primary: "submitted" });
    expect(screenPorts("screen.confirmation")).toEqual({
      primary: "confirmed",
      secondary: "cancelled",
    });
    expect(screenPorts("screen.qr-code")).toEqual({ primary: "next" });
    expect(screenPorts("privy.login")).toEqual({ primary: "user" });
    expect(screenPorts("world.id-verify")).toEqual({ primary: "verified", secondary: "rejected" });
  });
});
