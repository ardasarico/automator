import { Type, type Static, type TSchema } from "@sinclair/typebox";
import { Check } from "@sinclair/typebox/value";

/** Every non-2xx response in the API uses this body, whatever the endpoint. */
export const apiErrorCodeSchema = Type.Union([
  Type.Literal("forbidden"),
  Type.Literal("invalid_profile"),
  Type.Literal("invalid_request"),
  Type.Literal("not_found"),
  Type.Literal("unauthorized"),
  Type.Literal("unavailable"),
  Type.Literal("username_reserved"),
  Type.Literal("username_taken"),
]);
export type ApiErrorCode = Static<typeof apiErrorCodeSchema>;

export const apiErrorSchema = Type.Object({ error: apiErrorCodeSchema });
export type ApiError = Static<typeof apiErrorSchema>;

/** Statuses the API can produce for any endpoint, from its root error handler or a route. */
export const apiErrorResponses = {
  400: apiErrorSchema,
  401: apiErrorSchema,
  403: apiErrorSchema,
  404: apiErrorSchema,
  409: apiErrorSchema,
  422: apiErrorSchema,
  500: apiErrorSchema,
  503: apiErrorSchema,
} as const;

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * The single shape every endpoint is described with. `path` may contain `:name`
 * segments, which `buildPath` fills from `params`.
 */
export interface EndpointContract {
  readonly method: HttpMethod;
  readonly path: string;
  readonly params?: TSchema;
  readonly body?: TSchema;
  readonly response: { readonly [status: number]: TSchema };
}

export type ContractStatus<C extends EndpointContract> = Extract<keyof C["response"], number>;
export type ContractBody<C extends EndpointContract> = C extends {
  readonly body: infer B extends TSchema;
}
  ? Static<B>
  : undefined;
export type ContractParams<C extends EndpointContract> = C extends {
  readonly params: infer P extends TSchema;
}
  ? Static<P>
  : undefined;

/** Discriminated union of everything the endpoint may answer, keyed by status. */
export type ContractResult<C extends EndpointContract> = {
  [S in ContractStatus<C>]: { status: S; data: Static<C["response"][S]> };
}[ContractStatus<C>];

/** Raised when a response does not match the contract, or a path parameter is missing. */
export class ContractError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ContractError";
  }
}

const pathParameter = /:([A-Za-z0-9_]+)/g;

export function buildPath<C extends EndpointContract>(
  contract: C,
  params?: ContractParams<C>,
): string {
  const values = params as Record<string, string | number | undefined> | undefined;
  return contract.path.replace(pathParameter, (_match, key: string) => {
    const value = values?.[key];
    if (value === undefined || value === "")
      throw new ContractError(`Missing path parameter "${key}" for ${describe(contract)}`);
    return encodeURIComponent(String(value));
  });
}

/**
 * Validates a raw HTTP response against the contract and returns it as a
 * status-discriminated union. Unknown statuses and invalid bodies both throw.
 */
export function parseResponse<C extends EndpointContract>(
  contract: C,
  status: number,
  body: unknown,
): ContractResult<C> {
  const schema = contract.response[status];
  if (!schema)
    throw new ContractError(`Unexpected status ${status} for ${describe(contract)}`, status);
  if (!Check(schema, body))
    throw new ContractError(
      `Response body does not match ${describe(contract)} (${status})`,
      status,
    );
  return { status, data: body } as ContractResult<C>;
}

function describe(contract: EndpointContract) {
  return `${contract.method} ${contract.path}`;
}
