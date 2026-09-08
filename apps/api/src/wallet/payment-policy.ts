import {
  getPaymentPolicyContract,
  normalizePaymentPolicy,
  paymentPolicyProblem,
  updatePaymentPolicyContract,
  type PaymentPolicy,
} from "@automator/contracts";
import { PaymentPolicyOwnerMissingError, type PaymentPolicyStore } from "@automator/db";
import { Elysia, t } from "elysia";
import { createAuthGuard } from "../auth/guard";
import type { IdentityProvider } from "../auth/privy";

export type PaymentPolicyAccess = Pick<PaymentPolicyStore, "get" | "save">;

export function createPaymentPolicyRoutes({
  identity,
  paymentPolicies,
}: {
  identity: IdentityProvider | undefined;
  paymentPolicies?: PaymentPolicyAccess;
}) {
  return new Elysia({ name: "payment-policy" })
    .use(createAuthGuard(identity))
    .get(
      getPaymentPolicyContract.path,
      async ({ claims, status }) => {
        if (!paymentPolicies) return status(503, { error: "unavailable" });
        try {
          return await paymentPolicies.get(claims.id);
        } catch (error) {
          if (error instanceof PaymentPolicyOwnerMissingError)
            return status(401, { error: "unauthorized" });
          throw error;
        }
      },
      { response: getPaymentPolicyContract.response },
    )
    .put(
      updatePaymentPolicyContract.path,
      async ({ claims, body, status }) => {
        if (!paymentPolicies) return status(503, { error: "unavailable" });
        if (paymentPolicyProblem(body)) return status(400, { error: "invalid_request" });
        try {
          return await paymentPolicies.save(
            claims.id,
            normalizePaymentPolicy(body as PaymentPolicy),
          );
        } catch (error) {
          if (error instanceof PaymentPolicyOwnerMissingError)
            return status(401, { error: "unauthorized" });
          throw error;
        }
      },
      {
        body: t.Unknown(),
        response: updatePaymentPolicyContract.response,
      },
    );
}
