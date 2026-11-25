import { Link, Outlet, useNavigate } from "react-router-dom";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useSiteBranding } from "@/hooks/useSiteBranding";
import { Button } from "@/components/ui/button";
import { ArrowLeft, LogOut } from "lucide-react";
import logoSrc from "@/assets/logo.png";

const AccountantLayout = () => {
  const { user, role, signOut } = useAdminAuth();
  const { logoUrl, siteName } = useSiteBranding();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
    navigate("/admin/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={logoUrl || logoSrc}
              alt={siteName}
              className="h-7 w-auto object-contain shrink-0"
            />
            <span className="h-5 w-px bg-border shrink-0" />
            <h1 className="text-base sm:text-lg font-bold tracking-tight truncate">
              Accounting
            </h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {user?.email && (
              <span className="hidden md:inline text-xs text-muted-foreground truncate max-w-[220px]">
                {user.email}
              </span>
            )}
            {role === "admin" && (
              <Button variant="outline" size="sm" asChild>
                <Link to="/admin/dashboard">
                  <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
                  Admin
                </Link>
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-1.5" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-5">
        <Outlet />
      </main>
    </div>
  );
};

export default AccountantLayout;