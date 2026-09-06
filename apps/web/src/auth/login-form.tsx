"use client";
import { isOnboarded } from "@automator/contracts";
import { Button } from "@automator/ui/button";
import { Field, FieldLabel } from "@automator/ui/field";
import { Input } from "@automator/ui/input";
import { Spinner } from "@automator/ui/spinner";
import {
  Captcha,
  useLoginWithEmail,
  useLoginWithOAuth,
  useModalStatus,
  usePrivy,
} from "@privy-io/react-auth";
import { RiArrowLeftLine, RiGoogleFill } from "@remixicon/react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuthSession } from "./provider";
import { WalletLogin } from "./wallet-login";
import styles from "./auth.module.css";

export function LoginForm() {
  const router = useRouter();
  const { ready, authenticated } = usePrivy();
  const { user, error: sessionError, refresh, logout } = useAuthSession();
  const { isOpen: modalOpen } = useModalStatus();
  const { sendCode, loginWithCode } = useLoginWithEmail();
  const { initOAuth, loading: oauthLoading } = useLoginWithOAuth({
    onError: () => setError("Google sign-in wasn’t completed. Please try again."),
  });
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const requestInFlight = useRef(false);
  const disabled = !ready || busy || oauthLoading || modalOpen;

  useEffect(() => {
    if (authenticated && user) router.replace(isOnboarded(user) ? "/flows" : "/onboarding");
  }, [authenticated, user, router]);
  useEffect(() => {
    if (sent) codeRef.current?.focus();
  }, [sent]);
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function requestCode() {
    if (requestInFlight.current || cooldown > 0) return;
    requestInFlight.current = true;
    setCooldown(30);
    setBusy(true);
    setError(null);
    try {
      await sendCode({ email: email.trim() });
      setSent(true);
      setCode("");
      setCooldown(30);
    } catch {
      setError("We couldn’t send a code. Check your email address and try again.");
    } finally {
      requestInFlight.current = false;
      setBusy(false);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || requestInFlight.current) return;
    if (!sent) {
      await requestCode();
      return;
    }
    requestInFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await loginWithCode({ code });
    } catch {
      setError("That code couldn’t be verified. Try again or request a new code.");
    } finally {
      requestInFlight.current = false;
      setBusy(false);
    }
  }

  if (authenticated)
    return (
      <div className={styles.stack}>
        <div className={styles.intro}>
          <h1>Getting things ready</h1>
          <p>We’re preparing your account and wallet.</p>
        </div>
        {sessionError ? (
          <>
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
            <Button
              variant="ghost"
              onClick={() => {
                void logout().catch(() => {});
              }}
            >
              Log out
            </Button>
          </>
        ) : (
          <p className={styles.status} role="status">
            <Spinner aria-hidden="true" />
            Finishing sign-in…
          </p>
        )}
      </div>
    );

  return (
    <>
      <div className={styles.intro}>
        <h1>{sent ? "Check your email" : "Welcome to Automator"}</h1>
        <p>
          {sent
            ? `Enter the code we sent to ${email.trim()}.`
            : "Sign in or create an account to start building your flows."}
        </p>
      </div>
      <form className={styles.stack} onSubmit={submit}>
        {sent ? (
          <Field>
            <FieldLabel htmlFor="login-code">Verification code</FieldLabel>
            <Input
              ref={codeRef}
              id="login-code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              size="lg"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
              aria-describedby={error ? "login-error" : undefined}
              aria-invalid={Boolean(error)}
              disabled={disabled}
            />
          </Field>
        ) : (
          <Field>
            <FieldLabel htmlFor="login-email">Email address</FieldLabel>
            <Input
              ref={emailRef}
              id="login-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
              size="lg"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={disabled}
              aria-describedby={error ? "login-error" : undefined}
            />
          </Field>
        )}
        {error && (
          <p id="login-error" className={styles.error} role="alert">
            {error}
          </p>
        )}
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={disabled || (!sent && cooldown > 0)}
          loading={busy}
          loadingText={sent ? "Verifying code" : "Sending code"}
        >
          {sent
            ? "Verify and continue"
            : cooldown > 0
              ? `Try again in ${cooldown}s`
              : "Continue with email"}
        </Button>
        {sent && (
          <div className={styles.actions}>
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => {
                setSent(false);
                setError(null);
                setCode("");
                requestAnimationFrame(() => emailRef.current?.focus());
              }}
            >
              <RiArrowLeftLine aria-hidden="true" />
              Change email
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled || cooldown > 0}
              onClick={() => {
                void requestCode();
              }}
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
            </Button>
          </div>
        )}
      </form>
      {!sent && (
        <>
          <div className={styles.divider}>or</div>
          <div className={styles.alternatives}>
            <Button
              variant="outline"
              size="lg"
              className="w-full"
              disabled={disabled}
              loading={oauthLoading}
              loadingText="Opening Google"
              onClick={() => {
                setError(null);
                void initOAuth({ provider: "google" }).catch(() =>
                  setError("We couldn’t open Google sign-in. Please try again."),
                );
              }}
            >
              <RiGoogleFill aria-hidden="true" />
              Continue with Google
            </Button>
            <WalletLogin disabled={disabled} onError={setError} />
          </div>
        </>
      )}
      {!modalOpen && <Captcha />}
      <p className={styles.note}>
        <span>Powered by</span>
        <span className={styles.privyBrand}>
          <Image src="/integrations/privy.svg" alt="" width={20} height={20} />
          Privy
        </span>
      </p>
    </>
  );
}
