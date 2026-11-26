import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Loader2, Clock } from "lucide-react";
import { callbackQuickOption, type CallbackQuickOption } from "@/lib/callAttemptService";

const quickOptions: { value: CallbackQuickOption; label: string }[] = [
  { value: "in_2h", label: "2 საათში" },
  { value: "in_3h", label: "3 საათში" },
  { value: "in_4h", label: "4 საათში" },
  { value: "tomorrow", label: "ხვალ" },
];
const localDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tbilisi", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
function timePreview(iso: string, now: Date) {
  const date = new Date(iso);
  const tomorrow = new Date(now.getTime() + 86400000);
  const prefix = localDay(date) === localDay(now) ? "" : localDay(date) === localDay(tomorrow) ? "ხვალ "
    : `${date.toLocaleDateString("ka-GE", { timeZone: "Asia/Tbilisi", day: "2-digit", month: "short" })} `;
  return `→ ${prefix}${date.toLocaleTimeString("en-GB", { timeZone: "Asia/Tbilisi", hour: "2-digit", minute: "2-digit", hour12: false })}`;
}

interface Props {
  open: boolean;
  submitting?: boolean;
  onCancel: () => void;
  onConfirm: (whenIso: string) => void;
}

export default function CallbackPickerModal({ open, submitting, onCancel, onConfirm }: Props) {
  const [manual, setManual] = useState("");
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!open) return;
    setManual("");
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [open]);

  if (!open) return null;

  const pickManual = () => {
    if (!manual) return;
    const d = new Date(`${manual.length === 16 ? `${manual}:00` : manual}+04:00`);
    if (isNaN(d.getTime())) return;
    onConfirm(d.toISOString());
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-foreground/50" onClick={() => !submitting && onCancel()} />
      <div className="relative w-full sm:max-w-sm mx-0 sm:mx-4 bg-background sm:rounded-2xl rounded-t-2xl shadow-2xl border border-border">
        <div className="flex items-start justify-between px-4 pt-4 pb-2">
          <div>
            <h3 className="text-base font-extrabold flex items-center gap-1.5">
              <Clock className="w-4 h-4" /> გადარეკვის დრო
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">აირჩიე როდის დაურეკო ისევ.</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="დახურვა"
            onClick={() => !submitting && onCancel()}
            className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="px-4 pb-3 space-y-2">
          {quickOptions.map(option => {
            const whenIso = callbackQuickOption(option.value, now);
            return <Button key={option.value} onClick={() => onConfirm(whenIso)} disabled={submitting}
              className="w-full items-start justify-center flex-col h-14 gap-0.5" variant="outline">
              <span>{option.label}</span>
              <span className="text-xs text-muted-foreground font-normal">{timePreview(whenIso, now)}</span>
            </Button>;
          })}

          <div className="pt-2 border-t border-border mt-2">
            <label htmlFor="callback-custom-time" className="text-xs font-semibold text-muted-foreground">სხვა დრო</label>
            <div className="flex gap-2 mt-1">
              <Input
                id="callback-custom-time"
                type="datetime-local"
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                className="h-11 text-base"
              />
              <Button onClick={pickManual} disabled={!manual || submitting} className="gap-1.5">
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                შენახვა
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
