"use client";

import { isSecretName, secretTemplate } from "@automator/contracts";
import { Button } from "@automator/ui/button";
import { Field, FieldDescription, FieldLabel } from "@automator/ui/field";
import { Input } from "@automator/ui/input";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@automator/ui/tooltip";
import { RiDeleteBinLine, RiKey2Line } from "@remixicon/react";
import { useEffect, useState } from "react";
import { describeSecretError, useSecrets } from "./secrets-store";
import { useAccessToken } from "../auth/access-token";

/**
 * The Variables section: the user's secrets by name. A secret is written once and only ever
 * read by the API while it runs the user's flows; node config references it as
 * `{{secrets.<name>}}`. Values are never shown again.
 */
export function VariablesPanel() {
  const getAccessToken = useAccessToken();
  const status = useSecrets((state) => state.status);
  const secrets = useSecrets((state) => state.secrets);
  const loadError = useSecrets((state) => state.error);
  const load = useSecrets((state) => state.load);
  const save = useSecrets((state) => state.save);
  const remove = useSecrets((state) => state.remove);
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "idle") void getAccessToken().then(load);
  }, [status, getAccessToken, load]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!isSecretName(trimmed)) {
      setError("Names are lowercase letters, digits and underscores, starting with a letter.");
      return;
    }
    if (value === "") {
      setError("Enter a value.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await save(await getAccessToken(), trimmed, value);
      setName("");
      setValue("");
    } catch (caught) {
      setError(describeSecretError(caught));
    } finally {
      setBusy(false);
    }
  };

  const del = async (secretName: string) => {
    setError(null);
    try {
      await remove(await getAccessToken(), secretName);
    } catch (caught) {
      setError(describeSecretError(caught));
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <form className="flex flex-col gap-3 border-b p-3" onSubmit={submit}>
        <p className="text-caption text-muted-foreground">
          Secrets are stored encrypted and only read while your flows run. Use one in a node as{" "}
          <code className="font-mono">{"{{secrets.name}}"}</code>.
        </p>
        <Field className="gap-1.5">
          <FieldLabel htmlFor="secret-name">Name</FieldLabel>
          <Input
            id="secret-name"
            size="sm"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="discord_webhook"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field className="gap-1.5">
          <FieldLabel htmlFor="secret-value">Value</FieldLabel>
          <Input
            id="secret-value"
            size="sm"
            type="password"
            autoComplete="off"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
          <FieldDescription>Saving replaces an existing secret of the same name.</FieldDescription>
        </Field>
        {error && (
          <p className="text-caption text-destructive-text" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" size="sm" className="self-start" disabled={busy}>
          Save secret
        </Button>
      </form>
      <div className="p-3">
        <p className="mb-2 text-[11px] leading-[14px] tracking-[0.04em] text-muted-foreground uppercase">
          Secrets
        </p>
        {status === "failed" && (
          <p className="text-caption text-destructive-text" role="alert">
            {loadError}
          </p>
        )}
        {status === "ready" && secrets.length === 0 && (
          <p className="text-caption text-muted-foreground">No secrets yet.</p>
        )}
        <ul className="flex flex-col gap-1">
          {secrets.map((secret) => (
            <li
              key={secret.name}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent"
            >
              <RiKey2Line aria-hidden="true" className="size-4 flex-none text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate font-mono text-caption">
                {secretTemplate(secret.name)}
              </span>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Delete secret ${secret.name}`}
                      onClick={() => void del(secret.name)}
                    />
                  }
                >
                  <RiDeleteBinLine aria-hidden="true" />
                </TooltipTrigger>
                <TooltipPopup side="left">Delete</TooltipPopup>
              </Tooltip>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
