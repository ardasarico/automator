"use client";

import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "./select";

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;
const themes = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function ThemeSelect() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);

  return (
    <Select
      items={themes}
      value={mounted ? theme : "system"}
      disabled={!mounted}
      onValueChange={(value) => {
        if (value) setTheme(value);
      }}
    >
      <SelectTrigger aria-label="Theme" className="w-32 min-w-32">
        <SelectValue />
      </SelectTrigger>
      <SelectPopup>
        {themes.map(({ value, label }) => (
          <SelectItem key={value} value={value}>
            {label}
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  );
}
