"use client";

import { parseScreenConfig, type ScreenFormField } from "@automator/contracts";
import { Button } from "@automator/ui/button";
import { Field, FieldLabel } from "@automator/ui/field";
import { Input } from "@automator/ui/input";
import { Spinner } from "@automator/ui/spinner";
import { Textarea } from "@automator/ui/textarea";
import { RiCheckLine, RiCloseLine, RiQrCodeLine } from "@remixicon/react";
import type React from "react";
import { useState } from "react";
import { screenPorts, type ScreenNode } from "./engine";
import { PrivyLoginScreen, WorldIdVerifyScreen, type IdentityAnswer } from "./identity";
import { QrCode } from "./qr-code";

export type ScreenViewProps = {
  node: ScreenNode;
  /**
   * The visitor acted: continue on `port`; a form passes its values, an identity screen the
   * host's verified answer (or a sample record in the preview).
   */
  onContinue(port: string, data?: Record<string, string>, identity?: IdentityAnswer): void;
  /** Focused after a visitor action, so screen readers land on the new screen. */
  titleRef?: React.Ref<HTMLHeadingElement>;
};

function Title({
  children,
  titleRef,
}: {
  children: React.ReactNode;
  titleRef?: React.Ref<HTMLHeadingElement>;
}) {
  return (
    <h1 ref={titleRef} tabIndex={-1} className="text-panel text-balance outline-none">
      {children}
    </h1>
  );
}

/** Screen layout: scrolling content above a footer that keeps its actions reachable. */
export function ScreenFrame({
  children,
  footer,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pt-8 pb-6">
        {children}
      </div>
      {footer && <div className="flex flex-none flex-col gap-2 px-5 pb-5">{footer}</div>}
    </>
  );
}

function PageScreen({ node, onContinue, titleRef }: ScreenViewProps) {
  const config = parseScreenConfig("screen.page", node.config);
  const ports = screenPorts("screen.page");
  return (
    <ScreenFrame
      footer={
        <Button size="xl" onClick={() => onContinue(ports.primary)}>
          {config.button}
        </Button>
      }
    >
      <Title titleRef={titleRef}>{config.title || node.label}</Title>
      {config.body && (
        <p className="text-body whitespace-pre-line text-pretty text-muted-foreground">
          {config.body}
        </p>
      )}
    </ScreenFrame>
  );
}

function FormFieldControl({
  field,
  id,
  value,
  onChange,
}: {
  field: ScreenFormField;
  id: string;
  value: string;
  onChange(value: string): void;
}) {
  const shared = {
    id,
    name: field.id,
    required: field.required,
    placeholder: field.placeholder || undefined,
    value,
  };
  if (field.type === "textarea") {
    return <Textarea {...shared} rows={3} onChange={(event) => onChange(event.target.value)} />;
  }
  return (
    <Input
      {...shared}
      type={field.type}
      size="lg"
      inputMode={field.type === "number" ? "decimal" : undefined}
      step={field.type === "number" ? "any" : undefined}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function FormScreen({ node, onContinue, titleRef }: ScreenViewProps) {
  const config = parseScreenConfig("screen.form", node.config);
  const ports = screenPorts("screen.form");
  const formId = `screen-form-${node.id}`;
  const fields = config.fields.filter((field) => field.id !== "");
  return (
    <ScreenFrame
      footer={
        <Button size="xl" type="submit" form={formId}>
          {config.submit}
        </Button>
      }
    >
      <Title titleRef={titleRef}>{config.title || node.label}</Title>
      {config.description && (
        <p className="text-body text-pretty text-muted-foreground">{config.description}</p>
      )}
      <form
        id={formId}
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const data = Object.fromEntries(
            Array.from(new FormData(event.currentTarget)).filter(
              (entry): entry is [string, string] => typeof entry[1] === "string",
            ),
          );
          onContinue(ports.primary, data);
        }}
      >
        {fields.length === 0 ? (
          <p className="text-caption text-muted-foreground">This form has no fields yet.</p>
        ) : (
          fields.map((field) => <FormField key={field.id} field={field} formId={formId} />)
        )}
      </form>
    </ScreenFrame>
  );
}

function FormField({ field, formId }: { field: ScreenFormField; formId: string }) {
  const id = `${formId}-${field.id}`;
  return (
    <Field className="gap-1.5">
      <FieldLabel htmlFor={id}>{field.label || field.id}</FieldLabel>
      <UncontrolledField field={field} id={id} />
    </Field>
  );
}

/** Fields keep their own value; the form reads everything back on submit. */
function UncontrolledField({ field, id }: { field: ScreenFormField; id: string }) {
  const [value, setValue] = useState("");
  return <FormFieldControl field={field} id={id} value={value} onChange={setValue} />;
}

function ConfirmationScreen({ node, onContinue, titleRef }: ScreenViewProps) {
  const config = parseScreenConfig("screen.confirmation", node.config);
  const ports = screenPorts("screen.confirmation");
  return (
    <ScreenFrame
      footer={
        <>
          <Button size="xl" onClick={() => onContinue(ports.primary)}>
            {config.confirm}
          </Button>
          <Button
            size="xl"
            variant="outline"
            onClick={() => onContinue(ports.secondary ?? ports.primary)}
          >
            {config.cancel}
          </Button>
        </>
      }
    >
      <Title titleRef={titleRef}>{config.title || node.label}</Title>
      {config.message && (
        <p className="text-body whitespace-pre-line text-pretty text-muted-foreground">
          {config.message}
        </p>
      )}
    </ScreenFrame>
  );
}

function QrCodeScreen({ node, onContinue, titleRef }: ScreenViewProps) {
  const config = parseScreenConfig("screen.qr-code", node.config);
  const ports = screenPorts("screen.qr-code");
  const title = config.title || node.label;
  return (
    <ScreenFrame
      footer={
        <Button size="xl" onClick={() => onContinue(ports.primary)}>
          {config.button}
        </Button>
      }
    >
      <Title titleRef={titleRef}>{title}</Title>
      <div className="mx-auto aspect-square w-full max-w-56">
        {config.value ? (
          <QrCode value={config.value} label={`QR code: ${config.value}`} />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-muted-foreground">
            <RiQrCodeLine aria-hidden="true" className="size-8 opacity-60" />
            <span className="text-caption">No value to encode yet</span>
          </div>
        )}
      </div>
      {config.caption && (
        <p className="text-caption text-center text-pretty text-muted-foreground">
          {config.caption}
        </p>
      )}
    </ScreenFrame>
  );
}

/** One screen node, rendered by its type. */
export function ScreenView(props: ScreenViewProps): React.ReactElement {
  switch (props.node.type) {
    case "screen.page":
      return <PageScreen {...props} />;
    case "screen.form":
      return <FormScreen {...props} />;
    case "screen.confirmation":
      return <ConfirmationScreen {...props} />;
    case "screen.qr-code":
      return <QrCodeScreen {...props} />;
    case "privy.login":
      return <PrivyLoginScreen {...props} frame={ScreenFrame} title={Title} />;
    case "world.id-verify":
      return <WorldIdVerifyScreen {...props} frame={ScreenFrame} title={Title} />;
  }
}

export type WorkingStep = {
  id: string;
  label: string;
  status: "succeeded" | "failed" | "waiting";
  error?: string;
};

/** The interstitial while the engine runs the steps between two screens, one row per result. */
export function WorkingView({ steps }: { steps: WorkingStep[] }) {
  return (
    <ScreenFrame>
      <h1 className="text-panel text-balance">One moment</h1>
      <p className="text-body text-muted-foreground">Running the steps behind this screen.</p>
      <ol className="mt-2 flex flex-col gap-3" aria-live="polite">
        {steps.map((step) => (
          <li key={step.id} className="flex items-start gap-3" data-state={step.status}>
            <span className="flex h-6 w-5 flex-none items-center justify-center text-muted-foreground">
              {step.status === "failed" ? (
                <RiCloseLine aria-hidden="true" className="size-4 text-destructive-text" />
              ) : (
                <RiCheckLine aria-hidden="true" className="size-4 text-foreground" />
              )}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-body">
                {step.label}
                <span className="sr-only">{step.status === "failed" ? ", failed" : ", done"}</span>
              </span>
              {step.error && (
                <span className="text-caption text-destructive-text">{step.error}</span>
              )}
            </span>
          </li>
        ))}
        <li className="flex items-center gap-3" data-state="running">
          <span className="flex h-6 w-5 flex-none items-center justify-center text-muted-foreground">
            <Spinner className="size-4" />
          </span>
          <span className="text-body text-muted-foreground">Working…</span>
        </li>
      </ol>
    </ScreenFrame>
  );
}

/** A node failed: name it and the error, and offer a fresh start. */
export function FailedView({
  label,
  error,
  onRestart,
}: {
  label: string | undefined;
  error: string;
  onRestart: () => void;
}) {
  return (
    <ScreenFrame
      footer={
        <Button size="xl" variant="outline" onClick={onRestart}>
          Start over
        </Button>
      }
    >
      <h1 className="text-panel text-balance">Something went wrong</h1>
      <p className="text-body text-pretty text-muted-foreground">
        {label ? `${label} failed: ${error}` : error}
      </p>
    </ScreenFrame>
  );
}

/**
 * The failure screen a visitor of a published mini-app sees: one plain sentence, the owner's
 * note when they wrote one, and a fresh start. Never a node's name or its error text.
 */
export function VisitorFailedView({
  message,
  help,
  code,
  onRetry,
}: {
  message: string;
  help?: string;
  /** The API's failure code, or `unavailable` when the API could not be reached. */
  code?: string;
  onRetry: () => void;
}) {
  return (
    <ScreenFrame
      footer={
        <Button size="xl" onClick={onRetry}>
          Try again
        </Button>
      }
    >
      <div className="flex flex-col gap-4" data-failure={code ?? "unavailable"}>
        <h1 className="text-panel text-balance">Something went wrong</h1>
        <p className="text-body text-pretty text-muted-foreground">{message}</p>
        {help && <p className="text-body text-pretty">{help}</p>}
      </div>
    </ScreenFrame>
  );
}

export function EndView({ onRestart }: { onRestart?: () => void }) {
  return (
    <ScreenFrame
      footer={
        onRestart && (
          <Button size="xl" variant="outline" onClick={onRestart}>
            Start over
          </Button>
        )
      }
    >
      <h1 className="text-panel">All done</h1>
      <p className="text-body text-muted-foreground">This flow has finished.</p>
    </ScreenFrame>
  );
}

export function NoEntryView() {
  return (
    <ScreenFrame>
      <h1 className="text-panel text-balance">Not a mini-app yet</h1>
      <p className="text-body text-pretty text-muted-foreground">
        Add a “Mini-app opened” trigger and connect it to a screen to open this flow here.
      </p>
    </ScreenFrame>
  );
}
