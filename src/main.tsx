import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initStockOverrides } from "@/lib/stockOverrideStore";

// Initialize DB-backed stock overrides + realtime subscription
initStockOverrides();

createRoot(document.getElementById("root")!).render(<App />);
