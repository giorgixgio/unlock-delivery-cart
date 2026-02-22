import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initStockOverrides } from "@/lib/stockOverrideStore";
import { LanguageProvider } from "@/contexts/LanguageContext";

// Initialize DB-backed stock overrides + realtime subscription
initStockOverrides();

createRoot(document.getElementById("root")!).render(
  <LanguageProvider>
    <App />
  </LanguageProvider>
);
