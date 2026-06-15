import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Loader2, Clock } from "lucide-react";
import { callbackQuickOption } from "@/lib/callAttemptService";

interface Props {
  open: boolean;
  submitting?: boolean;
  onCancel: () => void;
  onConfirm: (whenIso: string) => void;
}

export default function CallbackPickerModal({ open, submitting, onCancel, onConfirm }: Props) {
  const [manual, setManual] = useState("");

  useEffect(() => {
    if (open) setManual("");
  }, [open]);

  if (!open) return null;

  const pick = (opt: "later_today" | "tomorrow" | "in_2h") => {
    onConfirm(callbackQuickOption(opt));
  };
  const pickManual = () => {
    if (!manual) return;
    const d = new Date(manual);
    if (isNaN(d.getTime())) return;
    onConfirm(d.toISOString());
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={() => !submitting && onCancel()} />
      <div className="relative w-full sm:max-w-sm mx-0 sm:mx-4 bg-background sm:rounded-2xl rounded-t-2xl shadow-2xl border border-border">
        <div className="flex items-start justify-between px-4 pt-4 pb-2">
          <div>
            <h3 className="text-base font-extrabold flex items-center gap-1.5">
              <Clock className="w-4 h-4" /> გადარეკვის დრო
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">აირჩიე როდის დაურეკო ისევ.</p>
          </div>
          <button
            onClick={() => !submitting && onCancel()}
            className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 pb-3 space-y-2">
          <Button onClick={() => pick("in_2h")} disabled={submitting} className="w-full justify-start h-12" variant="outline">
            2 საათში
          </Button>
          <Button onClick={() => pick("later_today")} disabled={submitting} className="w-full justify-start h-12" variant="outline">
            დღეს მოგვიანებით
          </Button>
          <Button onClick={() => pick("tomorrow")} disabled={submitting} className="w-full justify-start h-12" variant="outline">
            ხვალ
          </Button>

          <div className="pt-2 border-t border-border mt-2">
            <label className="text-xs font-semibold text-muted-foreground">სხვა დრო</label>
            <div className="flex gap-2 mt-1">
              <Input
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
