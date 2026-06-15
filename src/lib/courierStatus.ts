export type DerivedStatus =
  | "DELIVERED_TO_CUSTOMER"
  | "RETURNED_TO_SENDER"
  | "CANCELLED_OR_REFUSED"
  | "IN_TRANSIT"
  | "UNKNOWN";

export type ShipmentType = "CUSTOMER_DELIVERY" | "RETURN_TO_SENDER" | "UNKNOWN";

export const DERIVED_LABEL: Record<DerivedStatus, string> = {
  DELIVERED_TO_CUSTOMER: "ჩაბარდა",
  RETURNED_TO_SENDER: "უკან დაბრუნდა",
  CANCELLED_OR_REFUSED: "გაუქმდა / უარი",
  IN_TRANSIT: "გზაში",
  UNKNOWN: "უცნობი",
};

export const DERIVED_BADGE: Record<DerivedStatus, string> = {
  DELIVERED_TO_CUSTOMER: "bg-green-100 text-green-800 border-green-300",
  RETURNED_TO_SENDER: "bg-orange-100 text-orange-800 border-orange-300",
  CANCELLED_OR_REFUSED: "bg-red-100 text-red-800 border-red-300",
  IN_TRANSIT: "bg-blue-100 text-blue-800 border-blue-300",
  UNKNOWN: "bg-gray-100 text-gray-800 border-gray-300",
};

export const SHIPMENT_TYPE_LABEL: Record<ShipmentType, string> = {
  CUSTOMER_DELIVERY: "მიმღებთან",
  RETURN_TO_SENDER: "უკან დაბრუნება",
  UNKNOWN: "უცნობი",
};
