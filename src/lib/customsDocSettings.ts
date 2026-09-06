import { supabase } from "@/integrations/supabase/client";

/** Company details used on customs documents (packing list / invoice). */
export interface CustomsDocSettings {
  sellerName: string;
  sellerAddress: string;
  receiverName: string;
  receiverCode: string;
  receiverAddress: string;
  incoterms: string;
  invoicePrefix: string;
}

export const CUSTOMS_SETTING_KEYS: Record<keyof CustomsDocSettings, string> = {
  sellerName: "customs_seller_name",
  sellerAddress: "customs_seller_address",
  receiverName: "customs_receiver_name",
  receiverCode: "customs_receiver_code",
  receiverAddress: "customs_receiver_address",
  incoterms: "customs_incoterms",
  invoicePrefix: "customs_invoice_prefix",
};

export const CUSTOMS_DEFAULTS: CustomsDocSettings = {
  sellerName: "",
  sellerAddress: "",
  receiverName: "",
  receiverCode: "",
  receiverAddress: "",
  incoterms: "",
  invoicePrefix: "G888",
};

export async function loadCustomsDocSettings(): Promise<CustomsDocSettings> {
  const { data } = await supabase
    .from("site_settings")
    .select("key, value")
    .in("key", Object.values(CUSTOMS_SETTING_KEYS));
  const out = { ...CUSTOMS_DEFAULTS };
  const fields = Object.keys(CUSTOMS_SETTING_KEYS) as (keyof CustomsDocSettings)[];
  for (const row of data || []) {
    const field = fields.find((k) => CUSTOMS_SETTING_KEYS[k] === row.key);
    if (field && row.value) out[field] = row.value;
  }
  return out;
}
