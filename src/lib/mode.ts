import { useCallback, useState } from 'react';

// Simple mode (default) for presenting; expert mode shows every metric, control and report.
// Kept in the URL as ?x=1 so a link opens in the same mode.

export const EXPERT_PARAM = 'x';

export const isExpertInUrl = () => new URLSearchParams(window.location.search).get(EXPERT_PARAM) === '1';

export function useExpertMode(): [boolean, (v: boolean) => void] {
  const [expert, setState] = useState(isExpertInUrl);
  const setExpert = useCallback((v: boolean) => {
    const p = new URLSearchParams(window.location.search);
    if (v) p.set(EXPERT_PARAM, '1');
    else p.delete(EXPERT_PARAM);
    const q = p.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${q ? `?${q}` : ''}${window.location.hash}`);
    setState(v);
  }, []);
  return [expert, setExpert];
}
