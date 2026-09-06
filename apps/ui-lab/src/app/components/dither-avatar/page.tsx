import { DitherAvatar } from "@automator/ui/dither-avatar";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Dither Avatar" };

const names = ["ada", "arda", "automator", "flow-runner", "simulator", "zk-guild"];
const blooms = ["off", "low", "high", "aura"] as const;

export default function DitherAvatarPage() {
  return (
    <>
      <h1 className="mb-6 text-section">Dither Avatar</h1>
      <div className="grid max-w-3xl gap-10">
        <section aria-labelledby="avatar-seeds">
          <h2 id="avatar-seeds" className="mb-4 text-label">
            Seeds
          </h2>
          <p className="mb-4 max-w-prose text-caption text-muted-foreground">
            The name is the seed: the same name always renders the same avatar.
          </p>
          <div className="flex flex-wrap gap-5">
            {names.map((name) => (
              <div key={name} className="grid justify-items-center gap-2">
                <DitherAvatar name={name} className="size-12" />
                <span className="font-mono text-caption text-muted-foreground">{name}</span>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="avatar-sizes">
          <h2 id="avatar-sizes" className="mb-4 text-label">
            Sizes
          </h2>
          <div className="flex flex-wrap items-end gap-5">
            {["size-6", "size-8", "size-12", "size-16"].map((size) => (
              <DitherAvatar key={size} name="automator" className={size} />
            ))}
          </div>
        </section>

        <section aria-labelledby="avatar-bloom">
          <h2 id="avatar-bloom" className="mb-4 text-label">
            Bloom
          </h2>
          <div className="flex flex-wrap gap-5">
            {blooms.map((bloom) => (
              <div key={bloom} className="grid justify-items-center gap-2">
                <DitherAvatar bloom={bloom} name="flow-runner" className="size-12" />
                <span className="text-caption text-muted-foreground">{bloom}</span>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="avatar-mirror">
          <h2 id="avatar-mirror" className="mb-4 text-label">
            Mirror axis
          </h2>
          <div className="flex flex-wrap gap-5">
            {(["auto", "horizontal", "vertical"] as const).map((mirror) => (
              <div key={mirror} className="grid justify-items-center gap-2">
                <DitherAvatar mirror={mirror} name="simulator" className="size-12" />
                <span className="text-caption text-muted-foreground">{mirror}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
