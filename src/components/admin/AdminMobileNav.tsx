import { NavLink } from "react-router-dom";
import { LayoutDashboard, Printer, Truck, Zap, Package } from "lucide-react";
import { Button } from "@/components/ui/button";

const shortcuts = [
  { to: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/courier-labels", label: "Labels", accessibleLabel: "Courier Labels", icon: Printer },
  { to: "/admin/courier/today", label: "Onway", icon: Truck },
  { to: "/admin/test-sku", label: "Test SKUs", icon: Zap },
  { to: "/admin/products", label: "Products", icon: Package },
];

export default function AdminMobileNav({ visiblePaths }: { visiblePaths: string[] }) {
  const items = shortcuts.filter((item) => visiblePaths.includes(item.to));
  if (!items.length) return null;

  return (
    <nav
      aria-label="Admin quick navigation"
      className="fixed inset-x-0 bottom-0 z-40 flex gap-1 border-t border-border bg-card px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
    >
      {items.map(({ to, label, accessibleLabel, icon: Icon }) => (
        <Button
          key={to}
          asChild
          variant="ghost"
          className="h-[64px] min-w-0 flex-1 rounded-lg p-1 text-muted-foreground [&.active]:bg-accent [&.active]:text-accent-foreground [&_svg]:size-5"
        >
          <NavLink to={to} aria-label={accessibleLabel ?? label}>
            <span className="flex min-w-0 flex-col items-center gap-1.5">
              <Icon aria-hidden="true" />
              <span className="text-[11px] font-semibold leading-4">{label}</span>
            </span>
          </NavLink>
        </Button>
      ))}
    </nav>
  );
}