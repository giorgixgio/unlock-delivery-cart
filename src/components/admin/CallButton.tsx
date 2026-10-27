import { Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { startCallSync } from "@/lib/callSyncService";
import { toTelHref } from "@/lib/callSync";
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
 * (so their other device reacts), then immediately opens the tel: link.
 */
const CallButton = ({ orderId, phone, customerName, label = "დარეკვა", className }: CallButtonProps) => {
  const { user } = useAdminAuth();

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const telHref = user
      ? startCallSync({ operatorId: user.id, orderId, phone, customerName }).telHref
      : toTelHref(phone);
    window.location.href = telHref;
  };

  return (
    <Button
      size="sm"
      className={cn("gap-1.5", className)}
      onClick={handleClick}
      aria-label={`Call ${phone}`}
    >
      <Phone className="w-4 h-4" />
      {label}
    </Button>
  );
};

export default CallButton;
