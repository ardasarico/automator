"use client";

import {
  chainName,
  defaultChainId,
  parseScreenConfig,
  sampleUsdcPayment,
  sampleUsdcPaymentDeclined,
  screenPorts,
  type MiniAppPayment,
  type UsdcPaymentConfig,
} from "@automator/contracts";
import { Button } from "@automator/ui/button";
import { RiWallet3Line } from "@remixicon/react";
import { useEffect, useState } from "react";
import {
  ErrorNote,
  ProviderNote,
  useIdentityActions,
  useScreenAction,
  type IdentityScreenProps,
  type PaymentWallet,
} from "./identity";

/** An address as its two ends, which is what a visitor actually compares. */
export function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

/** What the screen actually shows about the payment, whether the API resolved it or not. */
type PaymentDetails = { amount: string; to: string; chainName: string };

/**
 * A served screen shows exactly what the API resolved. The builder's preview has no API, so it
 * stands the same rows up from the configuration: the chain the flow defaults to, and either the
 * recipient the flow names or a note that it collects into the owner's own wallet.
 */
function paymentDetails(
  config: UsdcPaymentConfig,
  payment: MiniAppPayment | undefined,
): PaymentDetails {
  if (payment)
    return { amount: payment.amount, to: shortAddress(payment.to), chainName: payment.chainName };
  const to = config.to.trim();
  return {
    amount: config.amount,
    to: to ? shortAddress(to) : "Your wallet",
    chainName: chainName(defaultChainId),
  };
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-caption text-muted-foreground">{label}</span>
      <span className="text-body min-w-0 truncate text-right font-medium">{value}</span>
    </div>
  );
}

/**
 * The screen a visitor pays from. Everything it signs — the token, the recipient and the exact
 * base units — was resolved by the API and travels on the screen, so the browser never derives
 * an amount of its own. Without a host to pay through (the builder's preview) it plays the
 * configured sample answer instead, the way the identity screens do.
 */
export function UsdcPaymentScreen({
  node,
  onContinue,
  titleRef,
  frame: Frame,
  title: Title,
}: IdentityScreenProps) {
  const config = parseScreenConfig("usdc.payment", node.config);
  const ports = screenPorts("usdc.payment");
  const actions = useIdentityActions()?.usdcPayment;
  const payment = node.payment;
  const { busy, error, start } = useScreenAction(
    actions && payment ? () => actions.pay(payment) : undefined,
    (answer) =>
      onContinue(ports.primary, { txHash: answer.txHash }, { privyToken: answer.privyToken }),
    "The payment did not go through. Try again.",
  );
  const preview = !actions;
  const unconfigured = !preview && !payment;
  const details = paymentDetails(config, payment);
  const amount = details.amount;
  const decline = () => onContinue(ports.secondary ?? ports.primary, undefined);
  const playSample = () => {
    if (config.simulate === "declined")
      onContinue(ports.secondary ?? ports.primary, { ...sampleUsdcPaymentDeclined });
    else onContinue(ports.primary, { ...sampleUsdcPayment(config, 84532) });
  };
  return (
    <Frame
      footer={
        <>
          <Button
            size="xl"
            loading={busy}
            loadingText="Waiting for the payment…"
            disabled={unconfigured}
            onClick={preview ? playSample : start}
          >
            Pay {amount} USDC
          </Button>
          <Button
            size="xl"
            variant="outline"
            disabled={busy}
            onClick={preview ? playSample : decline}
          >
            Not now
          </Button>
        </>
      }
    >
      <Title titleRef={titleRef}>{config.title || node.label}</Title>
      {config.description && (
        <p className="text-body whitespace-pre-line text-pretty text-muted-foreground">
          {config.description}
        </p>
      )}
      <div className="flex flex-col gap-2 rounded-lg border p-4">
        <Row label="Amount" value={`${amount} USDC`} />
        <Row label="To" value={details.to} />
        <Row label="Network" value={details.chainName} />
      </div>
      <PayingWallet payment={payment} />
      {preview && (
        <p className="text-caption text-muted-foreground" data-preview="usdc.payment">
          Preview: continues as {config.simulate === "declined" ? "declined" : "paid"}.
        </p>
      )}
      {unconfigured && (
        <p className="text-caption text-destructive-text">This app cannot take payments yet.</p>
      )}
      <ErrorNote error={error} />
    </Frame>
  );
}

/**
 * Who is about to pay, once the visitor is signed in. Read without prompting: a visitor who has
 * not signed in yet simply sees nothing here, and the Pay button signs them in when they press it.
 */
function PayingWallet({ payment }: { payment: MiniAppPayment | undefined }) {
  const actions = useIdentityActions()?.usdcPayment;
  const [wallet, setWallet] = useState<PaymentWallet | null>(null);
  useEffect(() => {
    if (!actions || !payment) return;
    let active = true;
    actions
      .wallet(payment)
      .then((found) => {
        if (active) setWallet(found);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [actions, payment]);
  if (!wallet) return null;
  const short = shortAddress(wallet.address);
  return (
    <ProviderNote icon={<RiWallet3Line className="size-4" />}>
      Paying from {short}, which holds {wallet.balance} USDC.
    </ProviderNote>
  );
}
