"use client";

import { Button } from "@automator/ui/button";
import {
  Menu,
  MenuCheckboxItem,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
  MenuTrigger,
} from "@automator/ui/menu";
import { RiArrowDownSLine, RiFileCopyLine, RiPencilLine } from "@remixicon/react";
import { useState } from "react";

export function MenuExamples() {
  const [action, setAction] = useState("No action selected.");
  const [showLabels, setShowLabels] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [density, setDensity] = useState("comfortable");

  return (
    <div className="grid max-w-4xl gap-6">
      <div className="flex flex-wrap gap-3">
        <Menu>
          <MenuTrigger render={<Button variant="secondary" />}>
            Actions <RiArrowDownSLine aria-hidden="true" />
          </MenuTrigger>
          <MenuPopup align="start" className="min-w-44">
            <MenuItem onClick={() => setAction("Rename selected.")}>
              <RiPencilLine aria-hidden="true" /> Rename
            </MenuItem>
            <MenuItem onClick={() => setAction("Duplicate selected.")}>
              <RiFileCopyLine aria-hidden="true" /> Duplicate
            </MenuItem>
            <MenuSub>
              <MenuSubTrigger>Move to</MenuSubTrigger>
              <MenuSubPopup>
                <MenuItem onClick={() => setAction("Drafts selected.")}>Drafts</MenuItem>
                <MenuItem onClick={() => setAction("Archive selected.")}>Archive</MenuItem>
              </MenuSubPopup>
            </MenuSub>
            <MenuItem disabled>Publish</MenuItem>
            <MenuSeparator />
            <MenuItem
              variant="destructive"
              onClick={() => setAction("Delete selected · preview only.")}
            >
              Delete
            </MenuItem>
          </MenuPopup>
        </Menu>

        <Menu>
          <MenuTrigger render={<Button variant="secondary" />}>
            Preferences <RiArrowDownSLine aria-hidden="true" />
          </MenuTrigger>
          <MenuPopup align="start" className="min-w-48">
            <MenuGroup>
              <MenuGroupLabel>Canvas</MenuGroupLabel>
              <MenuCheckboxItem
                checked={showLabels}
                onCheckedChange={setShowLabels}
                closeOnClick={false}
              >
                Show labels
              </MenuCheckboxItem>
              <MenuCheckboxItem
                variant="switch"
                checked={snapToGrid}
                onCheckedChange={setSnapToGrid}
                closeOnClick={false}
              >
                Snap to grid
              </MenuCheckboxItem>
            </MenuGroup>
            <MenuSeparator />
            <MenuGroup>
              <MenuGroupLabel>Density</MenuGroupLabel>
              <MenuRadioGroup value={density} onValueChange={setDensity}>
                <MenuRadioItem value="comfortable">Comfortable</MenuRadioItem>
                <MenuRadioItem value="compact">Compact</MenuRadioItem>
              </MenuRadioGroup>
            </MenuGroup>
          </MenuPopup>
        </Menu>
      </div>
      <div className="grid gap-1 text-caption text-muted-foreground" role="status">
        <p>{action}</p>
        <p>
          Labels {showLabels ? "on" : "off"} · Snap {snapToGrid ? "on" : "off"} · {density}
        </p>
      </div>
    </div>
  );
}
