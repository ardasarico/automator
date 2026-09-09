"use client";

import { Badge } from "@automator/ui/badge";
import { Button } from "@automator/ui/button";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuTrigger,
} from "@automator/ui/menu";
import { RiBracesLine } from "@remixicon/react";
import type { VariableKind, VariableOption } from "./schema";

/** What the reader needs to know before wiring a value into a comparison or a message. */
const kindLabels: Record<VariableKind, string> = {
  text: "text",
  number: "number",
  boolean: "true/false",
  object: "object",
  list: "list",
};

export function VariablePicker({
  options,
  onPick,
}: {
  options: VariableOption[];
  onPick(template: string): void;
}) {
  return (
    <Menu>
      <MenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label="Insert variable" />}>
        <RiBracesLine aria-hidden="true" />
      </MenuTrigger>
      <MenuPopup align="end" className="w-64">
        <MenuGroup>
          <MenuGroupLabel>Insert variable</MenuGroupLabel>
          {options.map((option) => (
            <MenuItem key={option.template} onClick={() => onPick(option.template)}>
              <span className="flex min-w-0 flex-col">
                <span className="flex min-w-0 items-baseline gap-1.5">
                  <span className="truncate">{option.label}</span>
                  {option.kind && (
                    <Badge variant="secondary" size="sm" className="font-normal">
                      {kindLabels[option.kind]}
                    </Badge>
                  )}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {option.source} · {option.template}
                </span>
              </span>
            </MenuItem>
          ))}
        </MenuGroup>
      </MenuPopup>
    </Menu>
  );
}
