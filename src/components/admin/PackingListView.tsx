import type { StickerOrder } from "./StickerPrintView";


export function openPackingListWindow(orders: StickerOrder[], navigate?: (path: string) => void) {
  // Store data in sessionStorage and navigate to the packing list page
  sessionStorage.setItem("__packing_list_data", JSON.stringify(orders));

  if (navigate) {
    navigate("/admin/packing-list");
  } else {
    // Fallback: open as a new tab pointing to the packing list route
    window.open("/admin/packing-list", "_blank");
  }
}
