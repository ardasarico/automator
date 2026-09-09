"use client";

import { DitherAvatar } from "@automator/ui/dither-avatar";
import { LogoMark } from "@automator/ui/logo";
import type { ListingAuthor } from "./listing";
import styles from "./listing-author.module.css";

/**
 * Who made a flow, as a person rather than a grey line at the bottom of a card. The avatar is
 * generated from the username, so every author has a face without anyone uploading one; ours is
 * the product mark, because Automator is not a person.
 *
 * `DitherAvatar` paints a canvas in an effect, so this is a client component. A server component
 * may render it, but must not expect the avatar in its HTML.
 */
export function ListingAuthorLine({
  author,
  size = 20,
}: {
  author: ListingAuthor;
  /** Pixels. The featured block asks for a larger one than a card does. */
  size?: number;
}) {
  if (author.kind === "automator") {
    return (
      <span className={styles.author}>
        <span className={styles.mark} style={{ width: size, height: size }} aria-hidden="true">
          <LogoMark className="size-3.5" />
        </span>
        <span className={styles.name}>Automator</span>
      </span>
    );
  }
  return (
    <span className={styles.author}>
      {/* Animating a dozen of these on one page would be noise, so cards get them painted. */}
      <DitherAvatar name={author.username} animate={false} size={size} className={styles.avatar} />
      <span className={styles.name}>
        <span className={styles.person}>{author.name}</span> @{author.username}
      </span>
    </span>
  );
}
