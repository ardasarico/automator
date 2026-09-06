# Interface copy

Read nearby labels and the action's implementation. Preserve the vocabulary used by the flow; the same action should have the same name in a button, dialog, and result message.

- Name the consequence of an action, especially in destructive confirmations. Keep target names visible when the user could confuse resources.
- Distinguish unavailable features, empty data, filtered-out results, pending work, and failures. Do not describe a placeholder action as a working capability.
- State what happened and an actionable recovery step when known. Do not invent a cause, retry guarantee, successful transaction, or persistence that the implementation does not establish.
- Describe a toggle's enabled behavior. Use placeholders for examples, with persistent labels for meaning.
- Prefer concise sentence case consistent with neighboring copy. Keep full templated messages and proper pluralization if localization is involved.

Verify wording against actual behavior. A copy-only edit usually needs source inspection and, if length changes, a wrapping check; it does not require a full design audit.
