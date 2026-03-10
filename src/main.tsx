import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initStockOverrides } from "@/lib/stockOverrideStore";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { ThresholdProvider } from "@/contexts/ThresholdContext";

// Initialize DB-backed stock overrides + realtime subscription
initStockOverrides();

createRoot(document.getElementById("root")!).render(
  <LanguageProvider>
    <ThresholdProvider>
      <App />
    </ThresholdProvider>
  </LanguageProvider>
);
