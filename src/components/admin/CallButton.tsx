import { Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { startCallSync } from "@/lib/callSyncService";
import { toTelHref, isDesktopDevice, getOpenTelOnThisDevice } from "@/lib/callSync";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface CallButtonProps {
  orderId: string;
  phone: string;
  customerName?: string | null;
  /** Visible label; pass "" for an icon-only button. */
  label?: string;
  className?: string;
}

/**
 * Big tappable call button. Records an active-call row for the operator
 * (so their other device reacts). Phones get a real <a href="tel:"> tap;
 * desktops only send the call to the phone unless the per-device setting is on.
 */
const CallButton = ({ orderId, phone, customerName, label = "დარეკვა", className }: CallButtonProps) => {
  const { user } = useAdminAuth();
  const telHref = toTelHref(phone);
  const desktop = isDesktopDevice();
  const openTel = getOpenTelOnThisDevice(desktop);

  const sync = () => {
    if (user) startCallSync({ operatorId: user.id, orderId, phone, customerName });
  };

  const content = (
    <>
      <Phone className="w-4 h-4" />
      {label}
    </>
  );

  if (desktop && !openTel) {
    return (
      <Button
        size="sm"
        className={cn("gap-1.5", className)}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          sync();
          toast({ title: `📱 გაიგზავნა ტელეფონზე — ${phone}` });
        }}
        aria-label={`Call ${phone}`}
      >
        {content}
      </Button>
    );
  }

  return (
    <Button size="sm" className={cn("gap-1.5", className)} asChild>
      <a
        href={telHref}
        onClick={(e) => {
          e.stopPropagation();
          sync();
        }}
        aria-label={`Call ${phone}`}
      >
        {content}
      </a>
    </Button>
  );
};

export default CallButton;
