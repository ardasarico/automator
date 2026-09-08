import {
  createNodePresetContract,
  deleteNodePresetContract,
  listNodePresetsContract,
  parseResponse,
  type NodePreset,
  type NodePresetInput,
} from "@automator/contracts";

export class PresetRequestError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "PresetRequestError";
  }
}

const presetsPath = "/api/node-presets";

async function call(
  path: string,
  method: string,
  token: string | null,
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  if (!token) throw new PresetRequestError("unauthorized");
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  try {
    return { status: response.status, data: await response.json() };
  } catch {
    throw new PresetRequestError("unavailable");
  }
}

export async function listNodePresetsRequest(token: string | null): Promise<readonly NodePreset[]> {
  const { status, data } = await call(presetsPath, listNodePresetsContract.method, token);
  const result = parseResponse(listNodePresetsContract, status, data);
  if (result.status !== 200) throw new PresetRequestError(result.data.error);
  return result.data.presets;
}

export async function createNodePresetRequest(
  token: string | null,
  input: NodePresetInput,
): Promise<NodePreset> {
  const { status, data } = await call(presetsPath, createNodePresetContract.method, token, input);
  const result = parseResponse(createNodePresetContract, status, data);
  if (result.status !== 201) throw new PresetRequestError(result.data.error);
  return result.data;
}

export async function deleteNodePresetRequest(id: string, token: string | null): Promise<void> {
  const { status, data } = await call(
    `${presetsPath}/${encodeURIComponent(id)}`,
    deleteNodePresetContract.method,
    token,
  );
  const result = parseResponse(deleteNodePresetContract, status, data);
  if (result.status !== 200) throw new PresetRequestError(result.data.error);
}
