"use client";

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
import type { VariableOption } from "./schema";

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
                <span className="truncate">{option.label}</span>
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
