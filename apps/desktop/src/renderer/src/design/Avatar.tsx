import { memo, useState } from 'react';
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
  // Track the url that failed to load so a broken/expired image src falls back
  // to initials instead of the native broken-image icon. Keyed by url (not a
  // bool) so a recycled virtualized row showing a fresh avatar retries cleanly.
  const [erroredUrl, setErroredUrl] = useState<string | null>(null);
  const showImg = url !== null && erroredUrl !== url;
  return (
    <div
      className="relative flex flex-none items-center justify-center bg-bg3 font-bold text-ink-mid"
      style={{ width: size, height: size, borderRadius: radius, fontSize: Math.round(size * 0.33) }}
    >
      {showImg ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setErroredUrl(url)}
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
