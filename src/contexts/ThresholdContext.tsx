import React, { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MIN_PRODUCT_QUANTITY } from "@/lib/constants";

interface ThresholdContextType {
  threshold: number;
}

const ThresholdContext = createContext<ThresholdContextType>({ threshold: MIN_PRODUCT_QUANTITY });

export const ThresholdProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [threshold, setThreshold] = useState(MIN_PRODUCT_QUANTITY);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", "minimum_product_quantity")
        .maybeSingle();
      if (data?.value) {
        const parsed = parseInt(data.value, 10);
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
