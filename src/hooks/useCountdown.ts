import { useEffect, useState } from 'react';
import { remainingUntil } from '@/lib/format';

export function useCountdown(targetIso: string) {
  const [r, setR] = useState(() => remainingUntil(targetIso));
  useEffect(() => {
    setR(remainingUntil(targetIso));
    const t = setInterval(() => setR(remainingUntil(targetIso)), 1000);
    return () => clearInterval(t);
  }, [targetIso]);
  return r;
}
