import { useId, useRef, useState, type RefObject } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CityOption, POPULAR_CITIES, searchOnwayCities } from "@/lib/onwayCities";
export default function OnwayCityPicker({ value, onChange, onSelect, cities, error, loading, inputRef, className, placeholder = "მაგ: თბილისი / ქუთაისი", onConfirm, selectedId }: {
  value: string; onChange: (value: string) => void; onSelect: (city: CityOption) => void; cities: CityOption[]; error?: string; loading?: boolean;
  inputRef?: RefObject<HTMLInputElement>; className?: string; placeholder?: string; onConfirm?: () => void; selectedId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const id = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const ownRef = useRef<HTMLInputElement>(null);
  const ref = inputRef || ownRef;
  const typed = value.trim().length > 0;
  const matches = searchOnwayCities(cities, value);
  const selected = selectedId ? cities.find(c => c.id === selectedId && c.name === value) : undefined;
  const chips = POPULAR_CITIES.map(n => cities.find(c => c.name === n)).filter((c): c is CityOption => !!c);
  const focusNext = () => setTimeout(() => {
    const scope = wrapRef.current?.closest("form, [role=dialog]") || document;
    const inputs = Array.from(scope.querySelectorAll<HTMLInputElement>("input:not([type=hidden]), textarea"));
    const own = wrapRef.current;
    const next = inputs.find(el => own && !own.contains(el) && (own.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING));
    next?.focus();
  }, 50);
  const choose = (c: CityOption, fromChip = false) => { onSelect(c); setOpen(false); if (onConfirm) onConfirm(); else if (fromChip) focusNext(); };
  const clear = () => { onChange(""); setTimeout(() => ref.current?.focus(), 30); };

  if (selected) return <div ref={wrapRef} className="min-w-0">
    <div className="flex h-12 items-center justify-between gap-2 rounded-md border-2 border-primary bg-primary/5 px-3">
      <span className="truncate text-base font-bold text-foreground">✓ {selected.name}</span>
      <Button type="button" variant="ghost" size="sm" className="h-9 shrink-0 text-sm font-semibold text-primary" onClick={clear}>შეცვლა</Button>
    </div>
    {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
  </div>;

  return <div ref={wrapRef} className="min-w-0">
    <Input ref={ref} role="combobox" aria-label="ქალაქი / რეგიონი" aria-controls={id} aria-expanded={open && typed} aria-autocomplete="list" aria-invalid={!!error} autoComplete="off" value={value} placeholder={placeholder} className={`h-12 !text-base ${className || ""}`}
      onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onChange={e => { onChange(e.target.value); setActive(0); setOpen(true); }}
      onKeyDown={e => { if (e.key === "Escape") setOpen(false); if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive(i => Math.min(i + 1, matches.length - 1)); } if (e.key === "ArrowUp") { e.preventDefault(); setActive(i => Math.max(0, i - 1)); } if (e.key === "Enter") { e.preventDefault(); const c = matches[active]; if (open && c) choose(c); } }} />
    {open && typed && <div id={id} role="listbox" className="mt-1 max-h-[26rem] overflow-y-auto rounded-md border border-border bg-popover text-popover-foreground">
      {matches.map((c, i) => <Button key={c.id} type="button" variant="ghost" role="option" aria-selected={i === active} className="w-full min-h-12 h-auto justify-start whitespace-normal text-left !text-base" onMouseDown={e => e.preventDefault()} onClick={() => choose(c)}>{c.name}</Button>)}
      {!matches.length && <p className="p-3 text-base text-muted-foreground">{loading ? "იტვირთება…" : "ქალაქი ვერ მოიძებნა"}</p>}
    </div>}
    {!typed && chips.length > 0 && <div className="mt-2 flex flex-wrap gap-2" aria-label="პოპულარული ქალაქები">
      {chips.map((c, i) => <Button key={c.id} type="button" variant={i === 0 ? "default" : "outline"}
        className={`h-11 rounded-full px-4 ${i === 0 ? "text-base font-bold" : "text-[15px] font-semibold"}`}
        onMouseDown={e => e.preventDefault()} onClick={() => choose(c, true)}>{c.name}</Button>)}
    </div>}
    {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
  </div>;
}
