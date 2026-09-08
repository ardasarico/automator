import { describe, expect, expectTypeOf, test } from "bun:test";
import { Type } from "@sinclair/typebox";
import {
  apiErrorSchema,
  buildPath,
  ContractError,
  parseResponse,
  type ApiErrorCode,
  type ContractResult,
} from "./contract";

const flowContract = {
  method: "GET",
  path: "/flows/:id/runs/:runId",
  params: Type.Object({ id: Type.String(), runId: Type.String() }),
  response: { 200: Type.Object({ id: Type.String() }), 404: apiErrorSchema },
} as const;

describe("endpoint contracts", () => {
  test("selects the response schema by status and returns a discriminated result", () => {
    const ok = parseResponse(flowContract, 200, { id: "run-1" });
    expect(ok).toEqual({ status: 200, data: { id: "run-1" } });
    const missing = parseResponse(flowContract, 404, { error: "not_found" });
    expect(missing).toEqual({ status: 404, data: { error: "not_found" } });
  });

  test("rejects a status the contract does not declare", () => {
    expect(() => parseResponse(flowContract, 500, { error: "unavailable" })).toThrow(ContractError);
    expect(() => parseResponse(flowContract, 500, { error: "unavailable" })).toThrow(/500/);
  });

  test("rejects a body that does not match the schema for that status", () => {
    expect(() => parseResponse(flowContract, 200, { id: 7 })).toThrow(ContractError);
    expect(() => parseResponse(flowContract, 404, { error: "teapot" })).toThrow(ContractError);
  });

  test("fills path parameters and escapes them", () => {
    expect(buildPath(flowContract, { id: "a b/c", runId: "1" })).toBe("/flows/a%20b%2Fc/runs/1");
  });

  test("refuses to build a path with a missing parameter", () => {
    // @ts-expect-error runId is required by the contract params schema
    expect(() => buildPath(flowContract, { id: "a" })).toThrow(ContractError);
    expect(() => buildPath(flowContract, { id: "a", runId: "" })).toThrow(/runId/);
  });

  test.each([".", ".."])("rejects the dot segment %s before URL resolution", (id) => {
    expect(() => buildPath(flowContract, { id, runId: "r1" })).toThrow(ContractError);
    expect(() => buildPath(flowContract, { id: "f1", runId: id })).toThrow(ContractError);
  });

  test("a contract without params keeps a literal path", () => {
    const ping = { method: "GET", path: "/ping", response: { 200: Type.Null() } } as const;
    expect(buildPath(ping)).toBe("/ping");
  });

  test("correlates status and payload types", () => {
    expectTypeOf<
      Extract<ContractResult<typeof flowContract>, { status: 200 }>["data"]
    >().toEqualTypeOf<{ id: string }>();
    expectTypeOf<
      Extract<ContractResult<typeof flowContract>, { status: 404 }>["data"]["error"]
    >().toEqualTypeOf<ApiErrorCode>();
  });
});
