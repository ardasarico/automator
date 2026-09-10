"use client";

import { Button } from "@automator/ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@automator/ui/menu";
import { RiArrowDownSLine, RiUpload2Line } from "@remixicon/react";
import { useBuilderDialogs } from "./builder-dialogs";

export function PublishButton() {
  const dialogs = useBuilderDialogs();
  return (
    <Menu>
      <MenuTrigger render={<Button variant="outline" size="sm" />}>
        <RiUpload2Line aria-hidden="true" />
        Share
        <RiArrowDownSLine aria-hidden="true" />
      </MenuTrigger>
      <MenuPopup align="end">
        <MenuItem onClick={() => dialogs.open("share-app")}>Share as a mini app</MenuItem>
        <MenuItem onClick={() => dialogs.open("use-api")}>Use as API</MenuItem>
        <MenuItem onClick={() => dialogs.open("listing")}>Publish to the marketplace</MenuItem>
      </MenuPopup>
    </Menu>
  );
}
