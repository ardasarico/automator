import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, expect, test } from "bun:test";
import { registerHotkey } from "./hotkeys";

GlobalRegistrator.register();
afterAll(async () => {
  await GlobalRegistrator.unregister();
});

test("a handled field shortcut does not also simulate the canvas", () => {
  let simulations = 0;
  const unregister = registerHotkey({
    combo: "mod+enter",
    scope: "canvas",
    allowInEditable: true,
    handler: () => simulations++,
  });
  const prompt = document.createElement("textarea");
  document.body.append(prompt);
  const sendPrompt = (event: Event) => event.preventDefault();
  prompt.addEventListener("keydown", sendPrompt);
  const press = () =>
    prompt.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        metaKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
  try {
    press();
    expect(simulations).toBe(0);
    prompt.removeEventListener("keydown", sendPrompt);
    press();
    expect(simulations).toBe(1);
  } finally {
    unregister();
    prompt.remove();
  }
});

test.each(["", "true", "plaintext-only"])(
  'canvas shortcuts stay quiet in contenteditable="%s" descendants',
  (value) => {
    let undos = 0;
    const unregister = registerHotkey({
      combo: "mod+z",
      scope: "canvas",
      handler: () => undos++,
    });
    const editor = document.createElement("div");
    editor.setAttribute("contenteditable", value);
    const child = document.createElement("span");
    editor.append(child);
    document.body.append(editor);
    try {
      child.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }));
      expect(undos).toBe(0);
    } finally {
      unregister();
      editor.remove();
    }
  },
);

test("a noneditable island inside an editor can use canvas shortcuts", () => {
  let undos = 0;
  const unregister = registerHotkey({
    combo: "mod+z",
    scope: "canvas",
    handler: () => undos++,
  });
  const editor = document.createElement("div");
  editor.setAttribute("contenteditable", "true");
  const button = document.createElement("button");
  button.setAttribute("contenteditable", "false");
  editor.append(button);
  document.body.append(editor);
  try {
    button.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }));
    expect(undos).toBe(1);
  } finally {
    unregister();
    editor.remove();
  }
});

test("shortcuts do not execute during text composition even when allowed in fields", () => {
  let simulations = 0;
  const unregister = registerHotkey({
    combo: "mod+enter",
    scope: "canvas",
    allowInEditable: true,
    handler: () => simulations++,
  });
  const prompt = document.createElement("textarea");
  document.body.append(prompt);
  try {
    for (const isComposing of [true, false]) {
      prompt.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          metaKey: true,
          bubbles: true,
          isComposing,
        }),
      );
      expect(simulations).toBe(isComposing ? 0 : 1);
    }
  } finally {
    unregister();
    prompt.remove();
  }
});

test("a dialog consumes suspended save without blocking native text undo", () => {
  let canvasActions = 0;
  const unregisterSave = registerHotkey({
    combo: "mod+s",
    scope: "canvas",
    allowInEditable: true,
    handler: () => canvasActions++,
  });
  const unregisterUndo = registerHotkey({
    combo: "mod+z",
    scope: "canvas",
    handler: () => canvasActions++,
  });
  const popup = document.createElement("div");
  popup.setAttribute("role", "dialog");
  popup.setAttribute("data-open", "");
  const field = document.createElement("textarea");
  popup.append(field);
  document.body.append(popup);
  try {
    for (const key of ["s", "z"]) {
      const event = new KeyboardEvent("keydown", {
        key,
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      field.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(key === "s");
    }
    expect(canvasActions).toBe(0);
  } finally {
    unregisterSave();
    unregisterUndo();
    popup.remove();
  }
});

test.each(["dialog", "alertdialog"])(
  "an open %s blocks background shortcuts, including events from a sibling portal",
  (role) => {
    const calls: string[] = [];
    const unregisterCanvas = registerHotkey({
      combo: "mod+enter",
      scope: "canvas",
      allowInEditable: true,
      handler: () => calls.push("canvas"),
    });
    const unregisterGlobal = registerHotkey({
      combo: "mod+shift+s",
      handler: () => calls.push("global"),
    });
    const popup = document.createElement("div");
    popup.setAttribute("role", role);
    popup.setAttribute("data-open", "");
    const field = document.createElement("textarea");
    popup.append(field);
    const portalButton = document.createElement("button");
    document.body.append(popup, portalButton);
    const pressRun = (target: HTMLElement) =>
      target.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", metaKey: true, bubbles: true }),
      );
    const pressGlobal = () =>
      portalButton.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "s",
          metaKey: true,
          shiftKey: true,
          bubbles: true,
        }),
      );
    let unregisterDialog: (() => void) | undefined;
    try {
      pressRun(field);
      pressRun(portalButton);
      pressGlobal();
      expect(calls).toEqual([]);
      unregisterDialog = registerHotkey({
        combo: "mod+enter",
        scope: "dialog",
        allowInEditable: true,
        handler: () => calls.push("dialog"),
      });
      pressRun(field);
      expect(calls).toEqual(["dialog"]);
      unregisterDialog();
      popup.removeAttribute("data-open");
      popup.setAttribute("data-closed", "");
      pressRun(portalButton);
      pressGlobal();
      expect(calls).toEqual(["dialog", "canvas", "global"]);
    } finally {
      unregisterDialog?.();
      unregisterCanvas();
      unregisterGlobal();
      popup.remove();
      portalButton.remove();
    }
  },
);
