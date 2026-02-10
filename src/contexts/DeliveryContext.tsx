import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from "react";

interface DeliveryContextType {
  isTbilisi: boolean;
  setManualLocation: (tbilisi: boolean) => void;
  isManualOverride: boolean;
  detectedCity: string | null;
  loading: boolean;
  processingDate: Date;
  deliveryDateStart: Date;
  deliveryDateEnd: Date;
  formatDate: (date: Date) => string;
}

const DeliveryContext = createContext<DeliveryContextType | undefined>(undefined);

const GEO_WEEKDAYS = ["კვი", "ორშ", "სამ", "ოთხ", "ხუთ", "პარ", "შაბ"];
const GEO_MONTHS = ["იან", "თებ", "მარ", "აპრ", "მაი", "ივნ", "ივლ", "აგვ", "სექ", "ოქტ", "ნოე", "დეკ"];

function formatDateGeo(date: Date): string {
  const wd = GEO_WEEKDAYS[date.getDay()];
  const d = date.getDate();
  const m = GEO_MONTHS[date.getMonth()];
  return `${wd}, ${d} ${m}`;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export const DeliveryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [detectedCity, setDetectedCity] = useState<string | null>(null);
  const [ipTbilisi, setIpTbilisi] = useState(false);
  const [manualOverride, setManualOverride] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const detect = async () => {
      try {
        const res = await fetch("https://ipapi.co/json/", { signal: AbortSignal.timeout(4000) });
        if (res.ok) {
          const data = await res.json();
          const city = data.city || "";
          setDetectedCity(city);
          setIpTbilisi(city.toLowerCase() === "tbilisi" || city === "თბილისი");
        }
      } catch {
        // Default to region
        setIpTbilisi(false);
      } finally {
        setLoading(false);
      }
    };
    detect();
  }, []);

  const isTbilisi = manualOverride !== null ? manualOverride : ipTbilisi;
  const isManualOverride = manualOverride !== null;

  const setManualLocation = useCallback((tbilisi: boolean) => {
    setManualOverride(tbilisi);
  }, []);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const processingDate = today;
  const deliveryDateStart = useMemo(() => addDays(today, 1), [today]);
  const deliveryDateEnd = useMemo(
    () => (isTbilisi ? addDays(today, 1) : addDays(today, 2)),
    [today, isTbilisi]
  );

  return (
    <DeliveryContext.Provider
      value={{
        isTbilisi,
        setManualLocation,
        isManualOverride,
        detectedCity,
        loading,
        processingDate,
        deliveryDateStart,
        deliveryDateEnd,
        formatDate: formatDateGeo,
      }}
    >
      {children}
    </DeliveryContext.Provider>
  );
};

export const useDelivery = () => {
  const ctx = useContext(DeliveryContext);
  if (!ctx) throw new Error("useDelivery must be used within DeliveryProvider");
  return ctx;
};
