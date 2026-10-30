import { useId, useRef, useState, type RefObject } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CityOption, POPULAR_CITIES, searchOnwayCities } from "@/lib/onwayCities";

const chipBase = "h-11 rounded-full px-3 text-[15px] font-semibold";

export default function OnwayCityPicker({ value, onChange, onSelect, cities, error, loading, inputRef, className, placeholder = "ჩაწერეთ ქალაქი ან სოფელი", onConfirm, selectedId }: {
  value: string; onChange: (value: string) => void; onSelect: (city: CityOption) => void; cities: CityOption[]; error?: string; loading?: boolean;
  inputRef?: RefObject<HTMLInputElement>; className?: string; placeholder?: string; onConfirm?: () => void; selectedId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [editing, setEditing] = useState(false);
  const id = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const ownRef = useRef<HTMLInputElement>(null);
  const ref = inputRef || ownRef;
  const typed = value.trim().length > 0;
  const matches = searchOnwayCities(cities, value);
  const selected = selectedId ? cities.find(c => c.id === selectedId && c.name === value) : undefined;
  const showInput = !selected || editing;
  const chips = POPULAR_CITIES.map(n => cities.find(c => c.name === n)).filter((c): c is CityOption => !!c);

  /** Focus the next field synchronously (iOS keyboard), scroll it into view and pulse it once. */
  const focusAddress = () => {
    const own = wrapRef.current; if (!own) return;
    const scope = own.closest("form, [role=dialog]") || document;
    const next = Array.from(scope.querySelectorAll<HTMLInputElement>("input:not([type=hidden]), textarea"))
      .find(el => !own.contains(el) && (own.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING));
    if (!next) return;
    next.focus({ preventScroll: true });
    next.scrollIntoView({ behavior: "smooth", block: "center" });
    const host = next.parentElement;
    next.classList.remove("address-attn"); void next.offsetWidth; next.classList.add("address-attn");
    host?.setAttribute("data-attn-hint", "ქუჩა, სახლის ნომერი, ბინა");
    setTimeout(() => { next.classList.remove("address-attn"); host?.removeAttribute("data-attn-hint"); }, 3500);
  };
  const choose = (c: CityOption) => { onSelect(c); setOpen(false); setEditing(false); focusAddress(); onConfirm?.(); };
  const clear = () => { onChange(""); setEditing(true); ref.current?.focus(); setTimeout(() => ref.current?.focus(), 30); };
  const other = () => { if (selected) { onChange(""); setEditing(true); setTimeout(() => ref.current?.focus(), 0); } else ref.current?.focus(); setOpen(true); };

  return <div ref={wrapRef} className="min-w-0">
    {selected && !editing && <div className="flex items-center gap-3">
      <span className="inline-flex h-11 items-center rounded-full bg-primary px-4 text-base font-bold text-primary-foreground">✓ {selected.name}</span>
      <button type="button" className="text-sm font-semibold text-primary underline underline-offset-2" onClick={clear}>შეცვლა</button>
    </div>}
    {showInput && <>
      <Input ref={ref} role="combobox" aria-label="ქალაქი / რეგიონი" aria-controls={id} aria-expanded={open && typed} aria-autocomplete="list" aria-invalid={!!error} autoComplete="off" value={value} placeholder={placeholder} className={`h-12 !text-base ${className || ""}`}
        onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onChange={e => { onChange(e.target.value); setActive(0); setOpen(true); }}
        onKeyDown={e => { if (e.key === "Escape") setOpen(false); if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive(i => Math.min(i + 1, matches.length - 1)); } if (e.key === "ArrowUp") { e.preventDefault(); setActive(i => Math.max(0, i - 1)); } if (e.key === "Enter") { e.preventDefault(); const c = matches[active]; if (open && c) choose(c); } }} />
      {open && typed && <div id={id} role="listbox" className="mt-1 max-h-[26rem] overflow-y-auto rounded-md border border-border bg-popover text-popover-foreground">
        {matches.map((c, i) => <Button key={c.id} type="button" variant="ghost" role="option" aria-selected={i === active} className="w-full min-h-12 h-auto justify-start whitespace-normal text-left !text-base" onMouseDown={e => e.preventDefault()} onClick={() => choose(c)}>{c.name}</Button>)}
        {!matches.length && <p className="p-3 text-base text-muted-foreground">{loading ? "იტვირთება…" : "ქალაქი ვერ მოიძებნა"}</p>}
      </div>}
    </>}
    {!(showInput && typed) && chips.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5" aria-label="პოპულარული ქალაქები">
      {chips.map(c => { const on = selected?.id === c.id; return <Button key={c.id} type="button" variant={on ? "default" : "outline"} aria-pressed={on}
        className={chipBase} onMouseDown={e => e.preventDefault()} onClick={() => choose(c)}>{on ? `✓ ${c.name}` : c.name}</Button>; })}
      <Button type="button" variant="outline" className={`${chipBase} border-dashed`} onMouseDown={e => e.preventDefault()} onClick={other}>სხვა ქალაქი / სოფელი 🔍</Button>
    </div>}
    {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
  </div>;
}
