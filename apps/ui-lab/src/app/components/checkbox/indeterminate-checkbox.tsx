"use client";

import { Checkbox } from "@automator/ui/checkbox";
import { useState } from "react";

export function IndeterminateCheckbox() {
  const [indeterminate, setIndeterminate] = useState(true);

  return <Checkbox indeterminate={indeterminate} onCheckedChange={() => setIndeterminate(false)} />;
}
