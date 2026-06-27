import type { CSSProperties } from "react";
import { avatarById } from "./player-avatar-data";

export function AvatarSprite({
  id,
  size = 7,
  className = "",
}: {
  id: string | undefined;
  size?: number;
  className?: string;
}) {
  const avatar = avatarById(id);
  const style = {
    "--avatar-px": `${size}px`,
    gridTemplateColumns: `repeat(${avatar.pixels[0]?.length ?? 1}, var(--avatar-px))`,
  } as CSSProperties;

  return (
    <div
      className={`avatar-sprite ${className}`}
      style={style}
      aria-label={avatar.name}
      title={avatar.name}
    >
      {avatar.pixels.flatMap((row, rowIndex) =>
        [...row].map((token, colIndex) => (
          <span
            key={`${rowIndex}:${colIndex}`}
            className="avatar-pixel"
            style={{ backgroundColor: token === "." ? "transparent" : avatar.palette[token] }}
          />
        )),
      )}
    </div>
  );
}
