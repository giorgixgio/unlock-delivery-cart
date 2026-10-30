import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

/** Our warehouse: Tbilisi, Kakheti highway 3 (Lilo). */
export const WAREHOUSE: [number, number] = [41.6919, 44.9801];
const CITIES: Record<string, [number, number]> = {
  "თბილისი": [41.7151, 44.8271], "ბათუმი": [41.6168, 41.6367], "ქუთაისი": [42.2679, 42.6946], "რუსთავი": [41.5495, 44.9932],
  "გორი": [41.9842, 44.1158], "ზუგდიდი": [42.5088, 41.8709], "ფოთი": [42.1462, 41.6719], "ხაშური": [41.9945, 43.5992],
  "სამტრედია": [42.1546, 42.3355], "სენაკი": [42.2704, 42.0675], "ოზურგეთი": [41.9244, 42.0068], "ტელავი": [41.9198, 45.4731],
  "ახალციხე": [41.6390, 42.9826], "მარნეული": [41.4759, 44.8081], "ქობულეთი": [41.8214, 41.7792], "წყალტუბო": [42.3413, 42.5976],
  "საგარეჯო": [41.7340, 45.3330], "გარდაბანი": [41.4607, 45.0947], "ბოლნისი": [41.4479, 44.5389], "ლაგოდეხი": [41.8268, 46.2766],
  "დუშეთი": [42.0848, 44.6961], "მესტია": [43.0459, 42.7276], "ბაღდათი": [42.0742, 42.8237], "მარტვილი": [42.4140, 42.3787],
  "ზესტაფონი": [42.1103, 43.0450], "ჭიათურა": [42.2898, 43.2817], "საჩხერე": [42.3442, 43.4153], "მცხეთა": [41.8456, 44.7206],
  "კასპი": [41.9250, 44.4220], "ახალქალაქი": [41.4051, 43.4862], "ბორჯომი": [41.8420, 43.3880], "გურჯაანი": [41.7440, 45.8010],
  "სიღნაღი": [41.6194, 45.9222], "ყვარელი": [41.9490, 45.8100], "თელავი": [41.9198, 45.4731], "ხობი": [42.3150, 41.9020],
  "ლანჩხუთი": [42.0891, 42.0326], "ამბროლაური": [42.5210, 43.1630], "ონი": [42.5790, 43.4420], "წალენჯიხა": [42.6050, 42.0720],
};
export const cityCoords = (city: string | null) => {
  const c = String(city ?? "").replace(/^ქ\.?\s*/, "").trim();
  return CITIES[c] ?? null;
};

/** Warehouse pin before handover; warehouse → customer city route line after. No courier position. */
export default function TrackingMap({ city, handed }: { city: string | null; handed: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let map: any;
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !el.current) return;
      map = L.map(el.current, { zoomControl: false, attributionControl: true, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, touchZoom: false, boxZoom: false, keyboard: false });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 18 }).addTo(map);
      const dot = (cls: string) => L.divIcon({ className: "", html: `<div class="${cls}"></div>`, iconSize: [18, 18], iconAnchor: [9, 9] });
      L.marker(WAREHOUSE, { icon: dot("tracking-pin tracking-pin-origin") }).addTo(map).bindTooltip("საწყობი", { permanent: true, direction: "top", offset: [0, -8] });
      const dest = handed ? cityCoords(city) : null;
      if (dest && (Math.abs(dest[0] - WAREHOUSE[0]) > 0.05 || Math.abs(dest[1] - WAREHOUSE[1]) > 0.05)) {
        L.polyline([WAREHOUSE, dest], { color: "hsl(var(--primary))", weight: 4, dashArray: "8 8" }).addTo(map);
        L.marker(dest, { icon: dot("tracking-pin tracking-pin-dest") }).addTo(map).bindTooltip(city || "", { permanent: true, direction: "top", offset: [0, -8] });
        map.fitBounds(L.latLngBounds([WAREHOUSE, dest]), { padding: [40, 40] });
      } else if (dest) {
        L.marker(dest, { icon: dot("tracking-pin tracking-pin-dest") }).addTo(map);
        map.setView(WAREHOUSE, 11);
      } else map.setView(WAREHOUSE, handed ? 8 : 13);
    });
    return () => { cancelled = true; map?.remove(); };
  }, [city, handed]);
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border">
      <div ref={el} className="h-56 w-full bg-muted" aria-label="რუკა" />
      {handed && <span className="absolute left-3 top-3 z-[400] rounded-full bg-primary px-3 py-1 text-sm font-bold text-primary-foreground">გზაშია</span>}
    </div>
  );
}
