"use client";

import { Badge } from "@automator/ui/badge";
import { RiShieldCheckLine } from "@remixicon/react";
import { EnableSigningButton } from "../../../builder/enable-signing-button";

/**
 * Whether the API's signer is granted on the wallet. `signing` is what the API reported
 * (absent when it cannot tell); the enable button re-checks the Privy session itself, so a
 * grant made moments ago shows without a reload.
 */
export function SigningStatus({ signing }: { signing: boolean | undefined }) {
  if (signing) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="success">
          <RiShieldCheckLine aria-hidden="true" />
          Server signing enabled
        </Badge>
        <p className="text-caption text-muted-foreground">
          Live runs sign transactions with this wallet, even while you are away.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-caption text-muted-foreground text-pretty">
        Live runs sign transactions with this embedded wallet; enable server signing so they can
        send while you are away.
      </p>
      <EnableSigningButton />
    </div>
  );
}
