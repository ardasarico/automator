"use client";

import { parseScreenConfig, type ScreenFormField } from "@automator/contracts";
import { Button } from "@automator/ui/button";
import { Field, FieldLabel } from "@automator/ui/field";
import { Input } from "@automator/ui/input";
import { Spinner } from "@automator/ui/spinner";
import { Textarea } from "@automator/ui/textarea";
import {
  RiCheckLine,
  RiCloseLine,
  RiEditLine,
  RiErrorWarningLine,
  RiQrCodeLine,
  RiQuestionLine,
} from "@remixicon/react";
import type React from "react";
import { useState } from "react";
import { screenPorts, type ScreenNode } from "./engine";
import {
  PrivyLoginScreen,
  WorldIdVerifyScreen,
  WorldSelfieCheckScreen,
  type IdentityAnswer,
} from "./identity";
import { UsdcPaymentScreen } from "./payment";
import { QrCode } from "./qr-code";

export type ScreenViewProps = {
  node: ScreenNode;
  onContinue(port: string, data?: Record<string, unknown>, identity?: IdentityAnswer): void;
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
    <h1 ref={titleRef} tabIndex={-1} className="text-page text-balance outline-none">
      {children}
    </h1>
  );
}

/**
 * The tile above a screen's title. It is decorative: the icon stands for the kind of screen, which
 * the title already says, so it carries no label of its own.
 */
function ScreenIcon({ children }: { children: React.ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className="mb-1 flex size-11 flex-none items-center justify-center rounded-2xl border bg-muted text-muted-foreground [&_svg]:size-5"
    >
      {children}
    </span>
  );
}

function ScreenFrame({
  children,
  footer,
  icon,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-5 pt-7 pb-6">
        {icon && <ScreenIcon>{icon}</ScreenIcon>}
        {children}
      </div>
      {footer && (
        <div
          data-slot="mini-app-footer"
          className="flex flex-none flex-col gap-2 px-5 pt-1 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
        >
          {footer}
        </div>
      )}
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
      icon={<RiEditLine />}
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
      <LocalField field={field} id={id} />
    </Field>
  );
}

/** A field whose value lives in the screen alone; the form reads it back on submit. */
function LocalField({ field, id }: { field: ScreenFormField; id: string }) {
  const [value, setValue] = useState("");
  return <FormFieldControl field={field} id={id} value={value} onChange={setValue} />;
}

function ConfirmationScreen({ node, onContinue, titleRef }: ScreenViewProps) {
  const config = parseScreenConfig("screen.confirmation", node.config);
  const ports = screenPorts("screen.confirmation");
  return (
    <ScreenFrame
      icon={<RiQuestionLine />}
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
      icon={<RiQrCodeLine />}
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
    case "world.selfie-check":
      return <WorldSelfieCheckScreen {...props} frame={ScreenFrame} title={Title} />;
    case "usdc.payment":
      return <UsdcPaymentScreen {...props} frame={ScreenFrame} title={Title} />;
    default:
      return <UnknownScreen titleRef={props.titleRef} />;
  }
}

/* A screen type published by a newer builder than this host: say so rather than render nothing. */
function UnknownScreen({ titleRef }: Pick<ScreenViewProps, "titleRef">) {
  return (
    <ScreenFrame icon={<RiErrorWarningLine />}>
      <Title titleRef={titleRef}>This screen cannot be shown</Title>
      <p className="text-body text-pretty text-muted-foreground">
        This app needs a newer version of Automator.
      </p>
    </ScreenFrame>
  );
}

export type WorkingStep = {
  id: string;
  label: string;
  status: "succeeded" | "failed" | "waiting";
  error?: string;
};

/*
 * A step's marker. Done steps recede into a filled muted disc; the failed one keeps its colour,
 * since it is the only row the visitor needs to read twice.
 */
function StepMarker({ status }: { status: WorkingStep["status"] }) {
  if (status === "failed")
    return (
      <span className="flex size-6 flex-none items-center justify-center rounded-full bg-destructive-surface text-destructive-text">
        <RiCloseLine aria-hidden="true" className="size-3.5" />
      </span>
    );
  return (
    <span className="flex size-6 flex-none items-center justify-center rounded-full bg-success-surface text-success-foreground">
      <RiCheckLine aria-hidden="true" className="size-3.5" />
    </span>
  );
}

export function WorkingView({ steps }: { steps: WorkingStep[] }) {
  return (
    <ScreenFrame>
      <h1 className="text-page text-balance">One moment</h1>
      <p className="text-body text-muted-foreground">Running the steps behind this screen.</p>
      <ol className="mt-1 flex flex-col gap-2" aria-live="polite">
        {steps.map((step) => (
          <li
            key={step.id}
            data-slot="mini-app-step"
            data-state={step.status}
            className="flex items-start gap-3 rounded-2xl bg-muted/60 px-3 py-2.5"
          >
            <StepMarker status={step.status} />
            <span className="flex min-w-0 flex-col gap-0.5 pt-0.5">
              {/* A step that failed keeps full contrast: it is the one row worth reading twice. */}
              <span
                className={
                  step.status === "failed" ? "text-body" : "text-body text-muted-foreground"
                }
              >
                {step.label}
                <span className="sr-only">{step.status === "failed" ? ", failed" : ", done"}</span>
              </span>
              {step.error && (
                <span className="text-caption text-destructive-text">{step.error}</span>
              )}
            </span>
          </li>
        ))}
        <li
          data-slot="mini-app-step"
          data-state="running"
          className="flex items-center gap-3 rounded-2xl border border-dashed px-3 py-2.5"
        >
          <span className="flex size-6 flex-none items-center justify-center text-muted-foreground">
            <Spinner className="size-4" />
          </span>
          <span className="text-body">Working…</span>
        </li>
      </ol>
    </ScreenFrame>
  );
}

/*
 * The in-browser mini-app's failure: the builder's screen preview and the `?preview` popup, both
 * the owner's own canvas. The visitor sentence leads, so the preview shows what a visitor would
 * read; the node's own error follows, since only the owner ever gets here.
 */
export function FailedView({
  label,
  message,
  error,
  onRestart,
  titleRef,
}: {
  label: string | undefined;
  message: string;
  error: string;
  onRestart: () => void;
  titleRef?: React.Ref<HTMLHeadingElement>;
}) {
  return (
    <ScreenFrame
      icon={<AlertIcon />}
      footer={
        <Button size="xl" variant="outline" onClick={onRestart}>
          Start over
        </Button>
      }
    >
      <Title titleRef={titleRef}>Something went wrong</Title>
      <p className="text-body text-pretty text-muted-foreground">{message}</p>
      <p
        className="rounded-2xl bg-muted px-3.5 py-3 text-caption text-pretty text-muted-foreground"
        data-owner-detail
      >
        {label ? `${label} failed: ${error}` : error}
      </p>
    </ScreenFrame>
  );
}

export function VisitorFailedView({
  message,
  help,
  code,
  onRetry,
  titleRef,
}: {
  message: string;
  help?: string;
  code?: string;
  onRetry: () => void;
  titleRef?: React.Ref<HTMLHeadingElement>;
}) {
  return (
    <ScreenFrame
      icon={<AlertIcon />}
      footer={
        <Button size="xl" onClick={onRetry}>
          Try again
        </Button>
      }
    >
      <div className="flex flex-col gap-4" data-failure={code ?? "unavailable"}>
        <Title titleRef={titleRef}>Something went wrong</Title>
        <p className="text-body text-pretty text-muted-foreground">{message}</p>
        {help && <p className="text-body text-pretty">{help}</p>}
      </div>
    </ScreenFrame>
  );
}

/** The tile the two failure views share, in the destructive surface rather than the muted one. */
function AlertIcon() {
  return (
    <span className="text-destructive-text">
      <RiErrorWarningLine />
    </span>
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
      {/* The only view with nothing left to read: it centres rather than stacking from the top. */}
      <div className="m-auto flex flex-col items-center gap-3 py-6 text-center">
        <span
          aria-hidden="true"
          className="flex size-14 items-center justify-center rounded-full bg-success-surface text-success-foreground"
        >
          <RiCheckLine className="size-7" />
        </span>
        <h1 className="text-page">All done</h1>
        <p className="text-body text-muted-foreground">This flow has finished.</p>
      </div>
    </ScreenFrame>
  );
}

export function NoEntryView() {
  return (
    <ScreenFrame icon={<RiErrorWarningLine />}>
      <h1 className="text-page text-balance">Not a mini-app yet</h1>
      <p className="text-body text-pretty text-muted-foreground">
        Add a “Mini-app opened” trigger and connect it to a screen to open this flow here.
      </p>
    </ScreenFrame>
  );
}
