import { useEffect, useState } from "react";
import { CityOption, loadOnwayCities } from "@/lib/onwayCities";
export function useOnwayCities() {
  const [cities, setCities] = useState<CityOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => { let live = true; loadOnwayCities().then(c => { if (live) setCities(c); }).catch(() => { if (live) setError(true); }).finally(() => { if (live) setLoading(false); }); return () => { live = false; }; }, []);
  return { cities, loading, error };
}