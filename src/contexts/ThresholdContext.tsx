import React, { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DELIVERY_THRESHOLD as DEFAULT_THRESHOLD } from "@/lib/constants";

interface ThresholdContextType {
  threshold: number;
}

const ThresholdContext = createContext<ThresholdContextType>({ threshold: DEFAULT_THRESHOLD });

export const ThresholdProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", "minimum_order_threshold")
        .maybeSingle();
      if (data?.value) {
        const parsed = parseFloat(data.value);
        if (!isNaN(parsed) && parsed > 0) setThreshold(parsed);
      }
    };
    fetch();
  }, []);

  return (
    <ThresholdContext.Provider value={{ threshold }}>
      {children}
    </ThresholdContext.Provider>
  );
};

export const useThreshold = () => useContext(ThresholdContext).threshold;
