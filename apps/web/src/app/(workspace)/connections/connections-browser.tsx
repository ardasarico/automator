"use client";

import {
  isSecretName,
  secretTemplate,
  type ApiKeySummary,
  type SecretSummary,
} from "@automator/contracts";
import { Badge } from "@automator/ui/badge";
import { Button } from "@automator/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@automator/ui/dialog";
import { Field, FieldLabel } from "@automator/ui/field";
import { Input } from "@automator/ui/input";
import { RiDeleteBinLine, RiKey2Line, RiTerminalBoxLine } from "@remixicon/react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { useAccessToken } from "../../../auth/access-token";
import { describeSecretError, useSecrets } from "../../../builder/secrets-store";
import {
  createApiKey,
  describeApiKeyError,
  revokeApiKey,
} from "../../../connections/api-keys-client";
import { detectChannels } from "../../../components/connected-apps";
import { CopyButton } from "../../../components/copy-button";
import { LocalDate } from "../../../components/local-date";
import styles from "./connections.module.css";

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  const id = `connections-${title.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <section className={styles.section} aria-labelledby={id}>
      <header className={styles.sectionHead}>
        <h2 id={id} className={styles.sectionTitle}>
          {title}
        </h2>
        <p className={styles.sectionText}>{description}</p>
      </header>
      <div className={styles.card}>{children}</div>
    </section>
  );
}

/**
 * Asks before something irreversible. The row owns `open`, so the dialog outlives whatever
 * popup the click came from; a failure stays in the dialog with its reason and the row intact.
 */
function ConfirmDialog({
  title,
  description,
  confirmLabel,
  open,
  onOpenChange,
  onConfirm,
  describeError,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  open: boolean;
  onOpenChange(open: boolean): void;
  onConfirm(): Promise<void>;
  describeError(caught: unknown): string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogPopup className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="px-6 text-caption text-destructive-text">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" loading={busy} onClick={confirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

/** What to do when the API could not be asked: say so, and offer the only useful action. */
function Unavailable({ children }: { children: string }) {
  return (
    <div className={styles.unavailable}>
      <p role="alert" className="text-caption text-destructive-text">
        {children}
      </p>
      <form action="/connections" method="get">
        <Button variant="outline" size="sm" type="submit">
          Try again
        </Button>
      </form>
    </div>
  );
}

function SecretForm() {
  const router = useRouter();
  const getAccessToken = useAccessToken();
  const save = useSecrets((state) => state.save);
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
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
      /* The list is rendered on the server, so the saved secret arrives the way it is stored. */
      router.refresh();
    } catch (caught) {
      setError(describeSecretError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <Field className={styles.field}>
        <FieldLabel htmlFor="secret-name">Name</FieldLabel>
        <Input
          id="secret-name"
          size="sm"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="discord_webhook"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </Field>
      <Field className={styles.field}>
        <FieldLabel htmlFor="secret-value">Value</FieldLabel>
        <Input
          id="secret-value"
          size="sm"
          type="password"
          autoComplete="off"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </Field>
      <Button type="submit" size="sm" disabled={busy}>
        Save secret
      </Button>
      {error && (
        <p role="alert" className={`${styles.formError} text-caption text-destructive-text`}>
          {error}
        </p>
      )}
    </form>
  );
}

function SecretRow({ secret }: { secret: SecretSummary }) {
  const router = useRouter();
  const getAccessToken = useAccessToken();
  const remove = useSecrets((state) => state.remove);
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <div className={styles.row}>
        <RiKey2Line aria-hidden="true" />
        <span className={styles.name}>{secretTemplate(secret.name)}</span>
        <span className={styles.when}>
          Saved <LocalDate value={secret.updatedAt} />
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Delete secret ${secret.name}`}
          onClick={() => setConfirming(true)}
        >
          <RiDeleteBinLine aria-hidden="true" />
        </Button>
      </div>
      <ConfirmDialog
        title={`Delete “${secret.name}”?`}
        description="Flows that read it will fail on their next run until you save a secret with the same name. This cannot be undone."
        confirmLabel="Delete secret"
        open={confirming}
        onOpenChange={setConfirming}
        onConfirm={async () => {
          await remove(await getAccessToken(), secret.name);
          router.refresh();
        }}
        describeError={describeSecretError}
      />
    </>
  );
}

/* A key is readable exactly once. Until it is dismissed it stays on screen, above its own list. */
function NewApiKey({ value, onDone }: { value: string; onDone: () => void }) {
  return (
    <div className={styles.issued} role="status">
      <p className="text-caption">
        Copy this key now. It is not shown again — if you lose it, revoke it and make another.
      </p>
      <div className={styles.issuedRow}>
        <code className={styles.issuedKey}>{value}</code>
        <CopyButton text={value} what="API key" copyLabel="Copy key" copiedLabel="Key copied" />
        <Button variant="ghost" size="sm" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}

function ApiKeyForm({ onIssued }: { onIssued: (key: string) => void }) {
  const router = useRouter();
  const getAccessToken = useAccessToken();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === "") {
      setError("Give the key a name, such as the machine that will use it.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await createApiKey(await getAccessToken(), trimmed);
      setName("");
      onIssued(created.key);
      router.refresh();
    } catch (caught) {
      setError(describeApiKeyError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <Field className={styles.field}>
        <FieldLabel htmlFor="api-key-name">Name</FieldLabel>
        <Input
          id="api-key-name"
          size="sm"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="CI server"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </Field>
      <Button type="submit" size="sm" disabled={busy}>
        Create key
      </Button>
      {error && (
        <p role="alert" className={`${styles.formError} text-caption text-destructive-text`}>
          {error}
        </p>
      )}
    </form>
  );
}

function ApiKeyRow({ apiKey }: { apiKey: ApiKeySummary }) {
  const router = useRouter();
  const getAccessToken = useAccessToken();
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <div className={styles.row}>
        <RiTerminalBoxLine aria-hidden="true" />
        <span className={styles.keyName}>{apiKey.name}</span>
        <span className={styles.name}>{apiKey.prefix}…</span>
        <span className={styles.when}>
          {apiKey.lastUsedAt ? (
            <>
              Last used <LocalDate value={apiKey.lastUsedAt} />
            </>
          ) : (
            "Never used"
          )}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Revoke API key ${apiKey.name}`}
          onClick={() => setConfirming(true)}
        >
          <RiDeleteBinLine aria-hidden="true" />
        </Button>
      </div>
      <ConfirmDialog
        title={`Revoke “${apiKey.name}”?`}
        description="The key stops working immediately. Anything still calling your flows with it gets an unauthorized answer. This cannot be undone."
        confirmLabel="Revoke key"
        open={confirming}
        onOpenChange={setConfirming}
        onConfirm={async () => {
          await revokeApiKey(await getAccessToken(), apiKey.id);
          router.refresh();
        }}
        describeError={describeApiKeyError}
      />
    </>
  );
}

function ApiKeys({ apiKeys }: { apiKeys: readonly ApiKeySummary[] | null }) {
  const [issued, setIssued] = useState<string | null>(null);
  return (
    <>
      <ApiKeyForm onIssued={setIssued} />
      {issued && <NewApiKey value={issued} onDone={() => setIssued(null)} />}
      {apiKeys === null ? (
        <Unavailable>API keys could not load. The API is unavailable right now.</Unavailable>
      ) : apiKeys.length === 0 ? (
        <p className={styles.empty}>
          No API keys yet. Create one to call a flow you have published as an API.
        </p>
      ) : (
        <div className={styles.list}>
          {apiKeys.map((apiKey) => (
            <ApiKeyRow key={apiKey.id} apiKey={apiKey} />
          ))}
        </div>
      )}
    </>
  );
}

/**
 * What the account has connected: the secrets its flows read, the apps those secrets reach, and
 * the keys machines call it with. Both lists come from the server so no value has to travel;
 * saving and deleting secrets go through the same store the builder's Variables panel uses.
 */
export function ConnectionsBrowser({
  secrets,
  apiKeys,
}: {
  secrets: readonly SecretSummary[] | null;
  apiKeys: readonly ApiKeySummary[] | null;
}) {
  const channels = secrets === null ? [] : detectChannels(secrets.map((secret) => secret.name));
  return (
    <>
      <Section
        title="Secrets"
        description={
          <>
            Stored encrypted and only read while a flow runs. A node reads one as{" "}
            <code className="font-mono">{"{{secrets.name}}"}</code>; the value is never shown again,
            here or on the canvas.
          </>
        }
      >
        <SecretForm />
        {secrets === null ? (
          <Unavailable>Secrets could not load. The API is unavailable right now.</Unavailable>
        ) : secrets.length === 0 ? (
          <p className={styles.empty}>No secrets yet. Save one above to use it in a flow.</p>
        ) : (
          <div className={styles.list}>
            {secrets.map((secret) => (
              <SecretRow key={secret.name} secret={secret} />
            ))}
          </div>
        )}
      </Section>
      <Section
        title="API keys"
        description="A key lets a machine call the flows you have published as an API, and nothing else on your account. It is shown once, when you create it."
      >
        <ApiKeys apiKeys={apiKeys} />
      </Section>
      <Section
        title="Connected apps"
        description="An app is connected once a secret it can be reached with exists. Automator looks for the name, so a Discord webhook stored as “discord_webhook” connects Discord."
      >
        {secrets === null ? (
          <Unavailable>
            Connected apps are unavailable while the secrets behind them cannot be read.
          </Unavailable>
        ) : (
          channels.map((channel) => (
            <div key={channel.id} className={styles.app}>
              <div className={styles.appText}>
                <p className={styles.appName}>{channel.label}</p>
                <p className={styles.appHint}>
                  {channel.connected
                    ? `Used through ${channel.secretNames.map((name) => secretTemplate(name)).join(", ")}.`
                    : channel.hint}
                </p>
              </div>
              {channel.connected ? (
                <Badge variant="success">Connected</Badge>
              ) : (
                <Badge variant="outline">Not connected</Badge>
              )}
            </div>
          ))
        )}
      </Section>
    </>
  );
}
