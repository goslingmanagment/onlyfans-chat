import { useState } from 'react';
import { usePurgeData } from '../../../bridge/queries';
import { Button } from '../../../design/Button';
import { Section } from '../SettingsSurface';

export function DangerZone(): React.JSX.Element {
  const purge = usePurgeData();
  const [arming, setArming] = useState(false);

  return (
    <Section
      title="Local data"
      hint="Purges the encrypted local cache (chats, messages, media). Nothing is deleted upstream."
    >
      {arming ? (
        <div className="flex items-center gap-3">
          <span className="text-[12.5px] font-semibold text-bad">
            Purge all locally cached data? The next sync rebuilds it from OFAPI.
          </span>
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              purge.mutate(undefined, { onSettled: () => setArming(false) });
            }}
          >
            Yes, purge
          </Button>
          <Button size="sm" onClick={() => setArming(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="danger" onClick={() => setArming(true)}>
          Purge local data…
        </Button>
      )}
    </Section>
  );
}
