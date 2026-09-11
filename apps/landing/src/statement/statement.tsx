import { RiEyeLine, RiQuillPenLine, type RemixiconComponentType } from "@remixicon/react";
import { container } from "../container";

type Token = { icon: RemixiconComponentType; color: string };

/* The two verbs are the product's own status pills: the one it replaces and the one it adds. */
const tokens: Record<string, Token> = {
  signs: { icon: RiQuillPenLine, color: "var(--warning)" },
  shows: { icon: RiEyeLine, color: "var(--success)" },
};

const sentence = "Every automation signs on your behalf. This one shows its work first.";

function Pill({ token, children }: { token: Token; children: string }) {
  const Icon = token.icon;
  return (
    <span
      className="mx-[0.12em] inline-flex translate-y-[-0.08em] items-center gap-[0.22em] rounded-full border px-[0.42em] py-[0.08em] align-middle font-medium text-[0.5em] leading-[1.2] tracking-normal"
      style={{
        color: token.color,
        borderColor: `color-mix(in srgb, ${token.color} 40%, transparent)`,
        background: `color-mix(in srgb, ${token.color} 12%, transparent)`,
      }}
    >
      <Icon aria-hidden="true" className="size-[1.1em]" />
      {children}
    </span>
  );
}

/**
 * One sentence between the features grid and the canvas, edge to edge, on a ground darker than
 * either theme's page. The `dark` class
 * re-scopes the palette steps, so the type is named by its step (`neutral-800`) rather than by
 * `foreground`, which the root resolves once and the light theme would leave dark grey.
 */
export function Statement() {
  return (
    <section className="dark bg-[oklch(0.11_0.003_220)] text-neutral-800">
      <div className={`${container} py-24 md:py-32`}>
        <p className="mx-auto max-w-[24ch] text-balance text-center font-semibold text-[clamp(1.75rem,3.6vw,3rem)] leading-[1.12] tracking-[-0.025em]">
          {sentence.split(" ").map((word, i, all) => {
            const bare = word.replace(/[.,]$/, "");
            const tail = word.slice(bare.length);
            const token = tokens[bare];
            return (
              <span key={i}>
                {token ? <Pill token={token}>{bare}</Pill> : bare}
                {tail}
                {i < all.length - 1 ? " " : ""}
              </span>
            );
          })}
        </p>
      </div>
    </section>
  );
}
