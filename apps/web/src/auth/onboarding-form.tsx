"use client";
import { isOnboarded, profileContract } from "@automator/contracts";
import { Button } from "@automator/ui/button";
import { Field, FieldDescription, FieldLabel } from "@automator/ui/field";
import { Input } from "@automator/ui/input";
import { Spinner } from "@automator/ui/spinner";
import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { authRequest, AuthRequestError } from "./client";
import { useAuthSession } from "./provider";
import styles from "./auth.module.css";

export function OnboardingForm() {
  const { ready, authenticated, getAccessToken } = usePrivy();
  const { user, pending, error: sessionError, refresh, logout } = useAuthSession();
  const router = useRouter();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usernameError, setUsernameError] = useState(false);
  useEffect(() => {
    if (ready && !authenticated) router.replace("/login");
    if (user && isOnboarded(user)) router.replace("/flows");
  }, [ready, authenticated, user, router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || pending || !user) return;
    setSaving(true);
    setError(null);
    setUsernameError(false);
    try {
      await authRequest(profileContract, await getAccessToken(), {
        name: name.trim(),
        username: username.toLowerCase(),
      });
      await refresh();
      router.replace("/flows");
      router.refresh();
    } catch (cause) {
      const taken =
        cause instanceof AuthRequestError &&
        ["username_taken", "username_reserved"].includes(cause.code);
      setUsernameError(taken);
      setError(
        taken
          ? "That username isn’t available. Choose another one."
          : "We couldn’t save your profile. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <div className={styles.intro}>
        <h1>Make it yours</h1>
        <p>Choose how you’ll appear in Automator.</p>
      </div>
      {sessionError ? (
        <div className={styles.stack}>
          <p className={styles.error} role="alert">
            {sessionError}
          </p>
          <Button
            onClick={() => {
              void refresh().catch(() => {});
            }}
          >
            Try again
          </Button>
        </div>
      ) : !user ? (
        <p className={styles.status} role="status">
          <Spinner aria-hidden="true" />
          Preparing your account…
        </p>
      ) : (
        <form className={styles.stack} onSubmit={submit}>
          <Field>
            <FieldLabel htmlFor="profile-name">Your name</FieldLabel>
            <Input
              id="profile-name"
              name="name"
              autoComplete="name"
              required
              maxLength={60}
              pattern=".*\S.*"
              size="lg"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={saving}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="profile-username">Username</FieldLabel>
            <Input
              id="profile-username"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              minLength={3}
              maxLength={24}
              pattern="[a-z][a-z0-9_]{2,23}"
              size="lg"
              placeholder="your_username"
              value={username}
              onChange={(event) => {
                setUsername(event.target.value.toLowerCase());
                setUsernameError(false);
              }}
              disabled={saving}
              aria-invalid={usernameError}
              aria-describedby={usernameError ? "profile-error username-hint" : "username-hint"}
            />
            <FieldDescription id="username-hint">
              3–24 characters. Start with a letter; use letters, numbers or underscores.
            </FieldDescription>
          </Field>
          {error && (
            <p id="profile-error" className={styles.error} role="alert">
              {error}
            </p>
          )}
          <Button
            type="submit"
            size="lg"
            className="w-full"
            loading={saving}
            loadingText="Saving your profile"
            disabled={pending}
          >
            Start building
          </Button>
        </form>
      )}
      <div className={styles.note}>
        <Button
          variant="ghost"
          size="sm"
          disabled={saving}
          onClick={() => {
            void logout().catch(() => {});
          }}
        >
          Log out
        </Button>
      </div>
    </>
  );
}
