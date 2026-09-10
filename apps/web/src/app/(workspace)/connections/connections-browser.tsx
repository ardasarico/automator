"use client";

import {
  isSecretName,
  secretTemplate,
  type ApiKeySummary,
  type SecretSummary,
} from "@automator/contracts";
import { Badge } from "@automator/ui/badge";
import { Button } from "@automator/ui/button";
import { Field, FieldLabel } from "@automator/ui/field";
import { Input } from "@automator/ui/input";
import { RiCheckLine, RiDeleteBinLine, RiKey2Line, RiTerminalBoxLine } from "@remixicon/react";
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
import styles from "./connections.module.css";

const dateFormat = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={styles.section} aria-labelledby={`connections-${title.toLowerCase()}`}>
      <header className={styles.sectionHead}>
        <h2 id={`connections-${title.toLowerCase()}`} className={styles.sectionTitle}>
          {title}
        </h2>
        <p className={styles.sectionText}>{description}</p>
      </header>
      <div className={styles.card}>{children}</div>
    </section>
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
  const [error, setError] = useState<string | null>(null);

  async function del() {
    setError(null);
    try {
      await remove(await getAccessToken(), secret.name);
      router.refresh();
    } catch (caught) {
      setError(describeSecretError(caught));
    }
  }

  return (
    <>
      <div className={styles.row}>
        <RiKey2Line aria-hidden="true" />
        <span className={styles.name}>{secretTemplate(secret.name)}</span>
        <span className={styles.when}>Saved {dateFormat.format(new Date(secret.updatedAt))}</span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Delete secret ${secret.name}`}
          onClick={() => void del()}
        >
          <RiDeleteBinLine aria-hidden="true" />
        </Button>
      </div>
      {error && (
        <p role="alert" className={`${styles.empty} text-destructive-text`}>
          {error}
        </p>
      )}
    </>
  );
}

/* A key is readable exactly once. Until it is dismissed it stays on screen, above its own list. */
function NewApiKey({ value, onDone }: { value: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={styles.issued} role="status">
      <p className="text-caption">
        Copy this key now. It is not shown again — if you lose it, revoke it and make another.
      </p>
      <div className={styles.issuedRow}>
        <code className={styles.issuedKey}>{value}</code>
        <Button
          variant="outline"
          size="sm"
          aria-live="polite"
          onClick={() => {
            void navigator.clipboard
              .writeText(value)
              .then(() => setCopied(true))
              .catch(() => setCopied(false));
          }}
        >
          {copied ? <RiCheckLine aria-hidden="true" /> : null}
          {copied ? "Key copied" : "Copy key"}
        </Button>
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
  const [error, setError] = useState<string | null>(null);

  async function revoke() {
    setError(null);
    try {
      await revokeApiKey(await getAccessToken(), apiKey.id);
      router.refresh();
    } catch (caught) {
      setError(describeApiKeyError(caught));
    }
  }

  return (
    <>
      <div className={styles.row}>
        <RiTerminalBoxLine aria-hidden="true" />
        <span className={styles.keyName}>{apiKey.name}</span>
        <span className={styles.name}>{apiKey.prefix}…</span>
        <span className={styles.when}>
          {apiKey.lastUsedAt
            ? `Last used ${dateFormat.format(new Date(apiKey.lastUsedAt))}`
            : "Never used"}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Revoke API key ${apiKey.name}`}
          onClick={() => void revoke()}
        >
          <RiDeleteBinLine aria-hidden="true" />
        </Button>
      </div>
      {error && (
        <p role="alert" className={`${styles.empty} text-destructive-text`}>
          {error}
        </p>
      )}
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
