"use client";
import { Button } from "@automator/ui/button";
import { useConnectWallet, useLoginWithSiwe } from "@privy-io/react-auth";
import { RiWallet3Line } from "@remixicon/react";
import { getAddress } from "viem";
import { useState } from "react";

export function WalletLogin({
  disabled,
  onError,
}: {
  disabled: boolean;
  onError: (message: string | null) => void;
}) {
  const [signing, setSigning] = useState(false);
  const { generateSiweMessage, loginWithSiwe } = useLoginWithSiwe();
  const { connectWallet } = useConnectWallet({
    onSuccess: ({ wallet }) => {
      void (async () => {
        setSigning(true);
        try {
          if (!("getEthereumProvider" in wallet)) throw new Error("Choose an Ethereum wallet");
          const provider = await wallet.getEthereumProvider();
          const chain = await provider.request({ method: "eth_chainId" });
          const chainId = Number(chain);
          if (!Number.isSafeInteger(chainId) || chainId <= 0)
            throw new Error("Invalid wallet chain");
          const message = await generateSiweMessage({
            address: getAddress(wallet.address),
            chainId: `eip155:${chainId}`,
          });
          const signature = await wallet.sign(message);
          await loginWithSiwe({
            message,
            signature,
            walletClientType: wallet.walletClientType,
            connectorType: wallet.connectorType,
          });
        } catch {
          onError(
            "Wallet sign-in wasn’t completed. Try again and approve the sign-in message in your wallet.",
          );
        } finally {
          setSigning(false);
        }
      })();
    },
    onError: (code) => {
      const online = navigator.onLine;
      console.warn(`Wallet connection failed ${JSON.stringify({ code, online })}`);
      onError(
        online
          ? "We couldn’t connect your wallet. Please try again."
          : "WalletConnect couldn’t start because this browser reports an offline state. If other sites work, try another browser.",
      );
    },
  });
  return (
    <Button
      variant="outline"
      size="lg"
      className="w-full"
      disabled={disabled}
      loading={signing}
      loadingText="Check your wallet"
      onClick={() => {
        onError(null);
        connectWallet();
      }}
    >
      <RiWallet3Line aria-hidden="true" />
      Continue with a wallet
    </Button>
  );
}
