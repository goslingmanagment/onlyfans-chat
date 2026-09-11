import { useEffect, useState } from 'react';

/** One display clock per surface; does not query or refresh any fan data. */
export function useContactClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const update = (): void => setNow(Date.now());
    const timer = window.setInterval(update, 60_000);
    window.addEventListener('focus', update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', update);
    };
  }, []);
  return now;
}
