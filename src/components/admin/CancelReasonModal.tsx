import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CANCEL_REASONS, DEFAULT_MAX_CALL_ATTEMPTS, type CancelReason } from "@/lib/cancelReasons";
import { X, AlertTriangle, Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  orderNumber?: string;
  callAttemptCount: number;
  maxAttempts?: number;
  /** Preselect a reason when opening (e.g. wrong_number from outcome button) */
  preselect?: CancelReason | null;
  submitting?: boolean;
  onCancel: () => void;
  onConfirm: (reason: CancelReason, note: string | null) => void;
}

export default function CancelReasonModal({
  open, orderNumber, callAttemptCount, maxAttempts = DEFAULT_MAX_CALL_ATTEMPTS,
  preselect, submitting, onCancel, onConfirm,
}: Props) {
  const [reason, setReason] = useState<CancelReason | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) {
      setReason(preselect ?? null);
      setNote("");
    }
  }, [open, preselect]);

  if (!open) return null;

  const maxReached = callAttemptCount >= maxAttempts;
  const needsNote = reason === "other";
  const noteValid = !needsNote || note.trim().length > 0;
  const canConfirm = reason !== null && noteValid && !submitting;

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={() => !submitting && onCancel()} />
      <div className="relative w-full sm:max-w-md mx-0 sm:mx-4 bg-background sm:rounded-2xl rounded-t-2xl shadow-2xl border border-border max-h-[92vh] flex flex-col">
        <div className="flex items-start justify-between px-4 pt-4 pb-2">
          <div>
            <h3 className="text-base font-extrabold">რატომ გაუქმდა შეკვეთა?</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              აირჩიე მიზეზი სწრაფად ან ჩაწერე ხელით.
              {orderNumber ? <> · #{orderNumber}</> : null}
            </p>
          </div>
          <button
            onClick={() => !submitting && onCancel()}
            className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
          {CANCEL_REASONS.map((r) => {
            const disabled = r.requiresMaxAttempts && !maxReached;
            const isSel = reason === r.value;
            return (
              <button
                key={r.value}
                type="button"
                disabled={disabled || submitting}
                onClick={() => setReason(r.value)}
                className={`w-full text-left px-3 py-3 rounded-xl border-2 text-sm font-bold transition-all flex items-center justify-between gap-2 ${
                  isSel
                    ? "border-red-600 bg-red-600 text-white shadow"
                    : disabled
                    ? "border-border bg-muted/40 text-muted-foreground opacity-60 cursor-not-allowed"
                    : "border-border bg-card text-foreground hover:bg-muted/60"
                }`}
              >
                <span className="flex-1">{r.label}</span>
                {r.requiresMaxAttempts && (
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                      isSel
                        ? "bg-white/20 text-white"
                        : maxReached
                        ? "bg-red-100 text-red-700"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    ცდა: {callAttemptCount}/{maxAttempts}
                  </span>
                )}
              </button>
            );
          })}

          {reason && reason !== "no_answer_after_attempts" && callAttemptCount < maxAttempts && reason !== "customer_refused" && reason !== "wrong_number" && reason !== "duplicate_order" && (
            <div className="rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-xs p-2.5 flex gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                ამ შეკვეთაზე ჯერ მხოლოდ {callAttemptCount} ზარია გაკეთებული. დარწმუნდი, რომ კლიენტთან რეალურად ვერ შეთანხმდი.
              </span>
            </div>
          )}

          {needsNote && (
            <div className="pt-1">
              <label className="text-xs font-semibold text-muted-foreground">ჩაწერე მიზეზი *</label>
              <textarea
                autoFocus
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="აღწერე მოკლედ"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[70px]"
              />
            </div>
          )}
        </div>

        <div className="border-t border-border px-4 py-3 flex flex-col-reverse sm:flex-row gap-2 justify-end">
          <Button variant="ghost" onClick={onCancel} disabled={submitting}>
            უკან დაბრუნება
          </Button>
          <Button
            onClick={() => reason && onConfirm(reason, needsNote ? note.trim() : null)}
            disabled={!canConfirm}
            className="bg-red-600 hover:bg-red-700 text-white gap-1.5"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            გაუქმება დადასტურება
          </Button>
        </div>
      </div>
    </div>
  );
}
