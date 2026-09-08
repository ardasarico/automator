import { AuthApiError, request } from "@automator/api-client/server";
import {
  getPaymentPolicyContract,
  paymentPolicyProblem,
  updatePaymentPolicyContract,
  type PaymentPolicy,
} from "@automator/contracts";
import { NextResponse } from "next/server";
import { authErrorResponse, bearerToken, isSameOrigin } from "../../../../auth/http";

export async function GET(req: Request) {
  if (!isSameOrigin(req)) return authErrorResponse(req, new AuthApiError(403, "forbidden"));
  const token = bearerToken(req);
  if (!token) return authErrorResponse(req, new AuthApiError(401, "unauthorized"));
  try {
    const result = await request(process.env.API_URL, getPaymentPolicyContract, {
      token,
      timeoutMs: 15_000,
    });
    if (result.status !== 200)
      return authErrorResponse(req, new AuthApiError(result.status, result.data.error));
    return NextResponse.json(result.data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return authErrorResponse(req, error);
  }
}

export async function PUT(req: Request) {
  if (!isSameOrigin(req)) return authErrorResponse(req, new AuthApiError(403, "forbidden"));
  const token = bearerToken(req);
  if (!token) return authErrorResponse(req, new AuthApiError(401, "unauthorized"));
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return authErrorResponse(req, new AuthApiError(400, "invalid_request"));
  }
  if (paymentPolicyProblem(body))
    return authErrorResponse(req, new AuthApiError(400, "invalid_request"));
  try {
    const result = await request(process.env.API_URL, updatePaymentPolicyContract, {
      token,
      body: body as PaymentPolicy,
      timeoutMs: 15_000,
    });
    if (result.status !== 200)
      return authErrorResponse(req, new AuthApiError(result.status, result.data.error));
    return NextResponse.json(result.data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return authErrorResponse(req, error);
  }
}
