export type DerivedStatus =
  | "DELIVERED_TO_CUSTOMER"
  | "FINAL_NOT_DELIVERED"
  | "CANCELLED_BEFORE_COURIER"
  | "RETURNED_TO_SENDER"
  | "IN_TRANSIT"
  // legacy alias — kept for old rows still in DB
  | "CANCELLED_OR_REFUSED"
  | "UNKNOWN";

export type ShipmentType = "CUSTOMER_DELIVERY" | "RETURN_TO_SENDER" | "UNKNOWN";

export const DERIVED_LABEL: Record<DerivedStatus, string> = {
  DELIVERED_TO_CUSTOMER: "ჩაბარდა კლიენტს",
  FINAL_NOT_DELIVERED: "არ ჩაბარდა / დასრულდა",
  CANCELLED_BEFORE_COURIER: "გაუქმდა მიღებამდე",
  RETURNED_TO_SENDER: "უკან დაბრუნდა",
  IN_TRANSIT: "გზაში / დამუშავება",
  CANCELLED_OR_REFUSED: "გაუქმდა / უარი",
  UNKNOWN: "უცნობი",
};

export const DERIVED_BADGE: Record<DerivedStatus, string> = {
  DELIVERED_TO_CUSTOMER: "bg-green-100 text-green-800 border-green-300",
  FINAL_NOT_DELIVERED: "bg-red-100 text-red-800 border-red-300",
  CANCELLED_BEFORE_COURIER: "bg-zinc-100 text-zinc-700 border-zinc-300",
  RETURNED_TO_SENDER: "bg-orange-100 text-orange-800 border-orange-300",
  IN_TRANSIT: "bg-blue-100 text-blue-800 border-blue-300",
  CANCELLED_OR_REFUSED: "bg-red-100 text-red-800 border-red-300",
  UNKNOWN: "bg-gray-100 text-gray-800 border-gray-300",
};

export const SHIPMENT_TYPE_LABEL: Record<ShipmentType, string> = {
  CUSTOMER_DELIVERY: "მიმღებთან",
  RETURN_TO_SENDER: "უკან დაბრუნება",
  UNKNOWN: "უცნობი",
};

/** Statuses that mean the courier customer-delivery attempt is finalized. */
export const FINALIZED_DELIVERY_STATUSES: DerivedStatus[] = [
  "DELIVERED_TO_CUSTOMER",
  "FINAL_NOT_DELIVERED",
];
