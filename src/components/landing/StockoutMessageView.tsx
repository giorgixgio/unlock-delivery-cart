import { Button } from "@/components/ui/button";
import { PackageX, Bell, ArrowRight, Check } from "lucide-react";
import { useState } from "react";
import { markStockoutWaitlist } from "@/lib/stockoutService";

interface StockoutMessageViewProps {
  attemptId?: string | null;
  onClose: () => void;
}

const StockoutMessageView = ({ attemptId, onClose }: StockoutMessageViewProps) => {
  const [waitlisted, setWaitlisted] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleWaitlist = async () => {
    if (!attemptId || waitlisted) return;
    setBusy(true);
    try {
      await markStockoutWaitlist(attemptId);
      setWaitlisted(true);
    } catch (e) {
      console.warn("waitlist failed", e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-center text-center py-6 px-2 gap-4">
      <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
        <PackageX className="w-8 h-8 text-amber-600" />
      </div>
      <div>
        <h3 className="text-xl font-extrabold text-foreground">მარაგი დროებით ამოიწურა</h3>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed max-w-sm">
          მადლობა ინტერესისთვის. ეს პროდუქტი ამ ეტაპზე ამოწურულია. თუ მალე დაბრუნდება მარაგში, შეგატყობინებთ.
        </p>
      </div>

      {attemptId && (
        <Button
          variant="outline"
          onClick={handleWaitlist}
          disabled={busy || waitlisted}
          className="w-full h-12 rounded-xl font-bold"
        >
          {waitlisted ? (
            <>
              <Check className="w-4 h-4 mr-2 text-emerald-600" />
              დაგიკავშირდებით
            </>
          ) : (
            <>
              <Bell className="w-4 h-4 mr-2" />
              შეტყობინება მარაგის დაბრუნებისას
            </>
          )}
        </Button>
      )}

      <Button
        onClick={onClose}
        className="w-full h-12 rounded-xl font-bold bg-primary text-primary-foreground"
      >
        სხვა პროდუქტების ნახვა
        <ArrowRight className="w-4 h-4 ml-2" />
      </Button>
    </div>
  );
};

export default StockoutMessageView;
