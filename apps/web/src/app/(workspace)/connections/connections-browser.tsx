"use client";

import { isSecretName, secretTemplate, type SecretSummary } from "@automator/contracts";
import { Badge } from "@automator/ui/badge";
import { Button } from "@automator/ui/button";
import { Field, FieldLabel } from "@automator/ui/field";
import { Input } from "@automator/ui/input";
import { RiDeleteBinLine, RiKey2Line } from "@remixicon/react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { useAccessToken } from "../../../auth/access-token";
import { describeSecretError, useSecrets } from "../../../builder/secrets-store";
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

/**
 * What the account has connected: the secrets its flows read, and the apps those secrets reach.
 * The list comes from the server so a secret's value never has to travel; saving and deleting go
 * through the same store the builder's Variables panel uses, so both stay in step.
 */
export function ConnectionsBrowser({ secrets }: { secrets: readonly SecretSummary[] | null }) {
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
