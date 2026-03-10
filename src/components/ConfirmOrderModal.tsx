import { useState, useEffect, useCallback, useRef } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ConfirmOrderModalProps {
  open: boolean;
  amount: number;
  onConfirm: () => void;
  onCancel: () => void;
  submitting: boolean;
}

const COUNTDOWN_SECONDS = 4;

const ConfirmOrderModal = ({ open, amount, onConfirm, onCancel, submitting }: ConfirmOrderModalProps) => {
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [confirmed, setConfirmed] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setCountdown(COUNTDOWN_SECONDS);
      setConfirmed(false);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
  }, [open]);

  // Countdown logic
  useEffect(() => {
    if (!open || confirmed || submitting) return;
    intervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          // Auto-confirm
          setConfirmed(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [open, confirmed, submitting]);

  // Trigger confirm when confirmed flag is set
  useEffect(() => {
    if (confirmed && !submitting) {
      onConfirm();
    }
  }, [confirmed]);

  const handleManualConfirm = useCallback(() => {
    if (submitting || confirmed) return;
    setConfirmed(true);
  }, [submitting, confirmed]);

  const handleCancel = useCallback(() => {
    if (submitting) return;
    if (intervalRef.current) clearInterval(intervalRef.current);
    onCancel();
  }, [submitting, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/40 animate-in fade-in duration-200"
        onClick={handleCancel}
      />
      {/* Modal */}
      <div className="relative w-full max-w-md mx-3 mb-3 sm:mb-0 bg-card rounded-2xl shadow-2xl animate-in slide-in-from-bottom-4 fade-in duration-250 overflow-hidden">
        {/* Close button */}
        <button
          onClick={handleCancel}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-muted/60 flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
          disabled={submitting}
        >
          <X className="w-4 h-4" />
        </button>

        <div className="px-5 pt-6 pb-5 space-y-4">
          {/* Icon */}
          <div className="flex justify-center">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
              <Check className="w-7 h-7 text-primary" />
            </div>
          </div>

          {/* Title */}
          <h3 className="text-lg font-extrabold text-foreground text-center">
            ადასტურებთ შეკვეთას?
          </h3>

          {/* Body */}
          <p className="text-sm text-muted-foreground text-center leading-relaxed">
            თქვენ ადასტურებთ, რომ კურიერთან მიღებისას გადაიხდით{" "}
            <span className="font-bold text-foreground">{amount.toFixed(1)} ლარს</span>.
          </p>

          {/* Countdown microcopy */}
          {!confirmed && !submitting && (
            <p className="text-[11px] text-muted-foreground text-center">
              თუ არაფერს დააჭერთ, შეკვეთა ავტომატურად დადასტურდება რამდენიმე წამში.
            </p>
          )}

          {/* Buttons */}
          <div className="space-y-2 pt-1">
            <Button
              onClick={handleManualConfirm}
              disabled={submitting || confirmed}
              className="w-full h-13 text-base font-bold rounded-xl cta-green-gradient text-white transition-all duration-300"
              size="lg"
            >
              {submitting
                ? "იგზავნება..."
                : confirmed
                ? "დადასტურდა ✓"
                : `დადასტურება (${countdown})`}
            </Button>
            <Button
              onClick={handleCancel}
              disabled={submitting}
              variant="ghost"
              className="w-full h-11 text-sm font-semibold text-muted-foreground rounded-xl"
            >
              შეკვეთის შეცვლა
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmOrderModal;
