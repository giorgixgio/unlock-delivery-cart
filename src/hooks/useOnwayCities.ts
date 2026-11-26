import { useEffect, useState } from "react";
import { CityOption, loadOnwayCities } from "@/lib/onwayCities";
export function useOnwayCities(enabled = true) {
  const [cities, setCities] = useState<CityOption[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!enabled) { setLoading(false); return; }
    let live = true;
    setLoading(true);
    setError(false);
    loadOnwayCities().then(c => { if (live) setCities(c); }).catch(() => { if (live) setError(true); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [enabled]);
  return { cities, loading, error };
}