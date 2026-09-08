import Image from "next/image";
import type { CatalogIcon } from "./catalog";

export function CatalogIconMark({
  icon,
  label,
  className = "size-4",
}: {
  icon: CatalogIcon;
  label?: string;
  className?: string;
}) {
  if (icon.kind === "logo") {
    return (
      <Image
        src={icon.src}
        alt={label ?? ""}
        width={16}
        height={16}
        className={`${className} ${icon.onWhite ? "rounded-xs bg-white" : ""}`.trim()}
      />
    );
  }
  const Icon = icon.icon;
  return label ? (
    <Icon role="img" aria-label={label} className={className} />
  ) : (
    <Icon aria-hidden="true" className={className} />
  );
}
