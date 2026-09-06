import { describe, expect, test } from "bun:test";
import { isProfileInput, isOnboarded, parseAuthError, parseAuthResponse, meContract } from "./auth";
import { ContractError } from "./contract";

const character = (code: number) => String.fromCharCode(code);

describe("profile input contract", () => {
  test.each([
    ["Alice", "alice"],
    ["Álvaro Núñez", "alvaro_1"],
    ["日本語 の 名前", "nihongo"],
    ["İbrahim Çağrı", "ibrahim"],
    ["Ada \u{1F680}", "ada"],
  ])("accepts %s", (name, username) => {
    expect(isProfileInput({ name, username })).toBe(true);
  });

  test.each([
    ["null byte", character(0x00)],
    ["bell", character(0x07)],
    ["newline", character(0x0a)],
    ["delete", character(0x7f)],
    ["soft hyphen", character(0x00ad)],
    ["zero width space", character(0x200b)],
    ["zero width joiner", character(0x200d)],
    ["right-to-left override", character(0x202e)],
    ["line separator", character(0x2028)],
    ["private use", character(0xe000)],
    ["byte order mark", character(0xfeff)],
  ])("rejects a name containing a %s", (_label, injected) => {
    expect(isProfileInput({ name: `Ali${injected}ce`, username: "alice" })).toBe(false);
  });

  test.each([
    { name: " ", username: "alice" },
    { name: "", username: "alice" },
    { name: "a".repeat(61), username: "alice" },
    { name: "Alice", username: "Alice" },
    { name: "Alice", username: "ab" },
    { name: "Alice", username: "a".repeat(25) },
    { name: "Alice", username: "1alice" },
    { name: "Alice", username: "alice", walletAddress: "0xforged" },
  ])("rejects invalid or identity-overriding input %j", (body) => {
    expect(isProfileInput(body)).toBe(false);
  });
});

describe("auth response helpers", () => {
  test("parseAuthResponse returns the success payload", () => {
    expect(parseAuthResponse(meContract, { user: null })).toEqual({ user: null });
  });

  test("parseAuthResponse rejects an error payload", () => {
    expect(() => parseAuthResponse(meContract, { error: "unauthorized" })).toThrow(ContractError);
  });

  test("parseAuthError accepts known codes and rejects unknown ones", () => {
    expect(parseAuthError({ error: "username_taken" })).toEqual({ error: "username_taken" });
    expect(() => parseAuthError({ error: "database credentials leaked" })).toThrow(ContractError);
  });

  test("onboarding needs a name, a username and a wallet", () => {
    const user = { id: "u", name: "Alice", username: "alice", walletAddress: "0x1" };
    expect(isOnboarded(user)).toBe(true);
    expect(isOnboarded({ ...user, walletAddress: null })).toBe(false);
    expect(isOnboarded({ ...user, username: null })).toBe(false);
  });
});
