import { useId, useState, type RefObject } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CityOption, searchOnwayCities } from "@/lib/onwayCities";
export default function OnwayCityPicker({ value, onChange, onSelect, cities, error, loading, inputRef, className, placeholder = "მაგ: თბილისი / ქუთაისი", onConfirm }: {
  value: string; onChange: (value: string) => void; onSelect: (city: CityOption) => void; cities: CityOption[]; error?: string; loading?: boolean;
  inputRef?: RefObject<HTMLInputElement>; className?: string; placeholder?: string; onConfirm?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const id = useId();
  const matches = searchOnwayCities(cities, value);
  const choose = (c: CityOption) => { onSelect(c); setOpen(false); onConfirm?.(); };
  return <div className="min-w-0">
    <Input ref={inputRef} role="combobox" aria-label="ქალაქი / რეგიონი" aria-controls={id} aria-expanded={open} aria-autocomplete="list" aria-invalid={!!error} autoComplete="off" value={value} placeholder={placeholder} className={`h-12 !text-base ${className || ""}`}
      onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onChange={e => { onChange(e.target.value); setActive(0); setOpen(true); }}
      onKeyDown={e => { if (e.key === "Escape") setOpen(false); if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive(i => Math.min(i + 1, matches.length - 1)); } if (e.key === "ArrowUp") { e.preventDefault(); setActive(i => Math.max(0, i - 1)); } if (e.key === "Enter") { e.preventDefault(); const c = matches[active]; if (open && c) choose(c); } }} />
    {open && <div id={id} role="listbox" className="mt-1 max-h-48 overflow-y-auto rounded-md border border-border bg-popover text-popover-foreground">
      {matches.map((c, i) => <Button key={c.id} type="button" variant="ghost" role="option" aria-selected={i === active} className="w-full min-h-12 h-auto justify-start whitespace-normal text-left !text-base" onMouseDown={e => e.preventDefault()} onClick={() => choose(c)}>{c.name}</Button>)}
      {!matches.length && <p className="p-3 text-base text-muted-foreground">{loading ? "იტვირთება…" : "ქალაქი ვერ მოიძებნა"}</p>}
    </div>}
    {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
  </div>;
}