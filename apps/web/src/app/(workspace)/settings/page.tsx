import type { Metadata } from "next";
import { PageFrame } from "../../../components/page-frame";
import { SettingsBrowser } from "./settings-browser";

export const metadata: Metadata = { title: "Settings · Automator" };

export default function SettingsPage() {
  return (
    <PageFrame title="Settings">
      <SettingsBrowser />
    </PageFrame>
  );
}
