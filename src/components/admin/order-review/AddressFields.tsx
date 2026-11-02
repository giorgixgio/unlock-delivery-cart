import { useCallback, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { TBILISI_DISTRICTS, isTbilisiCity, splitDistrict, composeAddress } from "@/lib/tbilisiDistricts";
import { validateConfirmAddress, type ConfirmAddressField, type ConfirmAddressResult } from "@/lib/confirmAddressValidation";

export interface AddressOrder {
  city: string | null;
  address_line1: string | null;
  address_line2: string | null;
  raw_city: string | null;
  raw_address: string | null;
  normalized_city: string | null;
  normalized_address: string | null;
}

/** Address state + save-diff logic shared by the quick-review pop-up and the Call Queue. */
export function useAddressFields() {
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [district, setDistrict] = useState("");
  const [courierNote, setCourierNote] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advRawCity, setAdvRawCity] = useState("");
  const [advNormCity, setAdvNormCity] = useState("");
  const [advRawAddr, setAdvRawAddr] = useState("");
  const [advNormAddr, setAdvNormAddr] = useState("");
  const [invalidField, setInvalidField] = useState<ConfirmAddressField | null>(null);
  const cityRef = useRef<HTMLInputElement | null>(null);
  const districtRef = useRef<HTMLInputElement | null>(null);
  const addressRef = useRef<HTMLInputElement | null>(null);

  const reset = useCallback((o: AddressOrder) => {
    setCity(o.normalized_city || o.city || "");
    const parts = splitDistrict(o.normalized_address || o.address_line1 || "");
    setDistrict(parts.district);
    setAddress(parts.rest);
    setCourierNote(o.address_line2 || "");
    setAdvRawCity(o.raw_city || "");
    setAdvNormCity(o.normalized_city || "");
    setAdvRawAddr(o.raw_address || "");
    setAdvNormAddr(o.normalized_address || "");
    setAdvancedOpen(false);
    setInvalidField(null);
  }, []);

  /** Diff vs loaded order. `extra` is merged before the advanced overrides (pop-up's operator note). */
  const collectUpdates = useCallback((order: AddressOrder | null, extra?: Record<string, unknown>): Record<string, unknown> => {
    if (!order) return {};
    const updates: Record<string, unknown> = {};
    const trimmedCity = city.trim();
    const trimmedAddr = isTbilisiCity(city) ? composeAddress(district, address) : address.trim();

    if (trimmedCity !== (order.normalized_city || order.city || "")) {
      updates.city = trimmedCity;
      updates.raw_city = trimmedCity;
      updates.normalized_city = trimmedCity;
      const lower = trimmedCity.toLowerCase();
      updates.is_tbilisi = lower === "თბილისი" || lower === "tbilisi";
    }
    if (trimmedAddr !== (order.normalized_address || order.address_line1 || "")) {
      updates.address_line1 = trimmedAddr;
      updates.raw_address = trimmedAddr;
      updates.normalized_address = trimmedAddr;
    }
    if ((courierNote || "") !== (order.address_line2 || "")) {
      updates.address_line2 = courierNote || null;
    }
    if (extra) Object.assign(updates, extra);
    if (advancedOpen) {
      if (advRawCity !== (order.raw_city || "")) updates.raw_city = advRawCity || null;
      if (advNormCity !== (order.normalized_city || "")) updates.normalized_city = advNormCity || null;
      if (advRawAddr !== (order.raw_address || "")) updates.raw_address = advRawAddr || null;
      if (advNormAddr !== (order.normalized_address || "")) updates.normalized_address = advNormAddr || null;
    }
    return updates;
  }, [city, address, district, courierNote, advancedOpen, advRawCity, advNormCity, advRawAddr, advNormAddr]);

  /** Validate for confirm; on failure highlight + focus the missing field. */
  const validateForConfirm = useCallback((): ConfirmAddressResult => {
    const r = validateConfirmAddress(city, district, address);
    if (!r.ok) {
      setInvalidField(r.field);
      const ref = r.field === "city" ? cityRef : r.field === "district" ? districtRef : addressRef;
      setTimeout(() => { ref.current?.focus(); ref.current?.scrollIntoView({ block: "center", behavior: "smooth" }); }, 0);
    } else setInvalidField(null);
    return r;
  }, [city, district, address]);

  return {
    city, setCity, address, setAddress, district, setDistrict, courierNote, setCourierNote,
    advancedOpen, setAdvancedOpen, advRawCity, setAdvRawCity, advNormCity, setAdvNormCity,
    advRawAddr, setAdvRawAddr, advNormAddr, setAdvNormAddr,
    invalidField, setInvalidField, cityRef, districtRef, addressRef,
    reset, collectUpdates, validateForConfirm,
  };
}

export type AddressFieldsState = ReturnType<typeof useAddressFields>;

const ERR = "border-destructive focus-visible:ring-destructive";

export default function AddressFields({ state: s, order }: { state: AddressFieldsState; order: AddressOrder }) {
  const clear = (f: ConfirmAddressField) => { if (s.invalidField === f) s.setInvalidField(null); };
  return (
    <section className="rounded-lg border border-border p-3 bg-card space-y-3">
      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">მისამართი</h3>
      <div>
        <Label className="text-xs">ქალაქი / რეგიონი</Label>
        <Input ref={s.cityRef} value={s.city} onChange={(e) => { s.setCity(e.target.value); clear("city"); }} placeholder="მაგ: თბილისი / ქუთაისი"
          className={`h-11 text-base ${s.invalidField === "city" ? ERR : ""}`} />
        {(order.raw_city || order.city) && (order.raw_city || order.city) !== s.city && <p className="mt-1 text-xs text-muted-foreground">Raw: {order.raw_city || order.city}</p>}
      </div>
      {isTbilisiCity(s.city) && (
        <div>
          <Label className="text-xs">
            რაიონი <span className="text-destructive">*</span>
          </Label>
          <Input
            ref={s.districtRef}
            value={s.district}
            onChange={(e) => { s.setDistrict(e.target.value); clear("district"); }}
            list="tbilisi-districts"
            placeholder="მაგ: ვაკე / საბურთალო"
            className={`h-11 text-base ${!s.district.trim() ? ERR : ""}`}
          />
          <datalist id="tbilisi-districts">
            {TBILISI_DISTRICTS.map((d) => <option key={d} value={d} />)}
          </datalist>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {TBILISI_DISTRICTS.slice(0, 8).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => { s.setDistrict(d); clear("district"); }}
                className={`px-2 py-1 rounded-md text-[11px] border transition-colors ${
                  s.district === d ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            რაიონი შეინახება მისამართის დასაწყისში: <span className="font-medium">{composeAddress(s.district || "…", s.address) || "…"}</span>
          </p>
        </div>
      )}
      <div>
        <Label className="text-xs">მისამართი</Label>
        <Input ref={s.addressRef} value={s.address} onChange={(e) => { s.setAddress(e.target.value); clear("address"); }} placeholder="ქუჩა, კორპუსი, ბინა ან სოფელი"
          className={`h-11 text-base ${s.invalidField === "address" ? ERR : ""}`} />
        {(order.raw_address || order.address_line1) && (order.raw_address || order.address_line1) !== composeAddress(s.district, s.address) && <p className="mt-1 text-xs text-muted-foreground break-words">Raw: {order.raw_address || order.address_line1}</p>}
      </div>
      <div>
        <Label className="text-xs">კომენტარი კურიერისთვის</Label>
        <textarea value={s.courierNote} onChange={(e) => s.setCourierNote(e.target.value)}
          placeholder="სადარბაზო, სართული, დამატებითი მინიშნება"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-base min-h-[60px]" />
      </div>

      <Collapsible open={s.advancedOpen} onOpenChange={s.setAdvancedOpen}>
        <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${s.advancedOpen ? "rotate-180" : ""}`} />
          Advanced address fields
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 space-y-2 pt-2 border-t border-dashed border-border">
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-[10px] uppercase text-muted-foreground">Raw city</Label>
              <Input value={s.advRawCity} onChange={(e) => s.setAdvRawCity(e.target.value)} className="h-8 text-xs" /></div>
            <div><Label className="text-[10px] uppercase text-muted-foreground">Normalized city</Label>
              <Input value={s.advNormCity} onChange={(e) => s.setAdvNormCity(e.target.value)} className="h-8 text-xs" /></div>
            <div><Label className="text-[10px] uppercase text-muted-foreground">Raw address</Label>
              <Input value={s.advRawAddr} onChange={(e) => s.setAdvRawAddr(e.target.value)} className="h-8 text-xs" /></div>
            <div><Label className="text-[10px] uppercase text-muted-foreground">Normalized address</Label>
              <Input value={s.advNormAddr} onChange={(e) => s.setAdvNormAddr(e.target.value)} className="h-8 text-xs" /></div>
          </div>
          <p className="text-[10px] text-muted-foreground">⚠ Advanced fields override simple input on save.</p>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
