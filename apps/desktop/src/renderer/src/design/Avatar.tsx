import { memo } from 'react';
import { initialsOf } from '../lib/messages';

/** Initials tile (mockup .ava) with optional online dot; img when avatarUrl set. */
export const Avatar = memo(function Avatar({
  name,
  url,
  online = false,
  size = 40,
  radius = 11,
}: {
  name: string;
  url: string | null;
  online?: boolean;
  size?: number;
  radius?: number;
}): React.JSX.Element {
  return (
    <div
      className="relative flex flex-none items-center justify-center bg-bg3 font-bold text-ink-mid"
      style={{ width: size, height: size, borderRadius: radius, fontSize: Math.round(size * 0.33) }}
    >
      {url !== null ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          style={{ borderRadius: radius }}
        />
      ) : (
        initialsOf(name)
      )}
      {online && (
        <span className="absolute -right-[3px] -bottom-[3px] h-[10px] w-[10px] rounded-full border-[2.5px] border-bg1 bg-online" />
      )}
    </div>
  );
});
