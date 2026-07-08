import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useParams, useSearchParams, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { trackPageView } from "@/lib/metaPixel";
import { CartProvider } from "@/contexts/CartContext";
import { DeliveryProvider } from "@/contexts/DeliveryContext";
import { AdminAuthProvider, useAdminAuth } from "@/contexts/AdminAuthContext";
import { CheckoutGateProvider } from "@/contexts/CheckoutGateContext";
import { CartOverlayProvider, useCartOverlay } from "@/contexts/CartOverlayContext";
import { LandingPageProvider } from "@/contexts/LandingPageContext";
import Index from "./pages/Index";
import Cart from "./pages/Cart";
import OrderSuccess from "./pages/OrderSuccess";
import StickyCartHUD from "./components/StickyCartHUD";
import NotFound from "./pages/NotFound";
import AdminLogin from "./pages/admin/AdminLogin";
import AdminLayout from "./pages/admin/AdminLayout";
import AdminOrders from "./pages/admin/AdminOrders";
import AdminOrderDetail from "./pages/admin/AdminOrderDetail";
import AdminSettings from "./pages/admin/AdminSettings";
import AdminShipping from "./pages/admin/AdminShipping";
import AdminProducts from "./pages/admin/AdminProducts";
import AdminSystemEvents from "./pages/admin/AdminSystemEvents";
import CourierExportSettings from "./pages/admin/CourierExportSettings";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminBatches from "./pages/admin/AdminBatches";
import AdminBatchDetail from "./pages/admin/AdminBatchDetail";
import Shop from "./pages/Shop";
import ProductLanding from "./pages/ProductLanding";
import AdminLandingPages from "./pages/admin/AdminLandingPages";
import AdminProductsImport from "./pages/admin/AdminProductsImport";
import AdminPackingList from "./pages/admin/AdminPackingList";
import AdminOperatorStats from "./pages/admin/AdminOperatorStats";
import AdminPackingWaves from "./pages/admin/AdminPackingWaves";
import AdminPackingWaveDetail from "./pages/admin/AdminPackingWaveDetail";
import AdminPackingRun from "./pages/admin/AdminPackingRun";
import AdminStockoutDemand from "./pages/admin/AdminStockoutDemand";
import AdminCourierImport from "./pages/admin/AdminCourierImport";
import AdminCourierReturnMatching from "./pages/admin/AdminCourierReturnMatching";
import AdminCourierAnalytics from "./pages/admin/AdminCourierAnalytics";
import AdminCourierImportMapping from "./pages/admin/AdminCourierImportMapping";
import AdminPacking from "./pages/admin/AdminPacking";
import AdminBinLocations from "./pages/admin/AdminBinLocations";

/** Landing page wrapper — provides LandingPageContext */
const LandingPageRoute = () => {
  const { slug } = useParams();
  return (
    <LandingPageProvider slug={slug || ""}>
      <ProductLanding />
    </LandingPageProvider>
  );
};

const queryClient = new QueryClient();

const AdminGuard = ({ children }: { children: React.ReactNode }) => {
  const { loading, isAdmin, session } = useAdminAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (!session || !isAdmin) return <Navigate to="/admin/login" replace />;
  return <>{children}</>;
};

const AdminLoginGuard = () => {
  const { loading, isAdmin, session } = useAdminAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (session && isAdmin) return <Navigate to="/admin/orders" replace />;
  return <AdminLogin />;
};

/** Legacy /cart route redirects to current page with cart overlay open */
const LegacyCartRedirect = () => {
  return <Navigate to="/?cart=1" replace />;
};

/** Legacy /products/:handle route from old Shopify store → redirect to shop, preserving all query params */
const LegacyProductRedirect = () => {
  const { handle } = useParams();
  const [searchParams] = useSearchParams();
  const newParams = new URLSearchParams(searchParams);
  newParams.set("product_id", handle || "");
  return <Navigate to={`/shop?${newParams.toString()}`} replace />;
};

const CartOverlayRenderer = () => {
  const { isCartOpen } = useCartOverlay();
  return <Cart isOpen={isCartOpen} />;
};

/** Fire Meta PageView on SPA route changes */
const MetaPageViewTracker = () => {
  const location = useLocation();
  useEffect(() => {
    trackPageView();
  }, [location.pathname]);
  return null;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <CartProvider>
        <DeliveryProvider>
          <AdminAuthProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <CartOverlayProvider>
              <CheckoutGateProvider>
                  <MetaPageViewTracker />
                  <Routes>
                    {/* Storefront */}
                    <Route path="/" element={<Index />} />
                    <Route path="/cart" element={<LegacyCartRedirect />} />
                    <Route path="/success" element={<OrderSuccess />} />
                    <Route path="/shop" element={<Shop />} />
                    {/* Landing page for individual products */}
                    <Route path="/p/:slug" element={<LandingPageRoute />} />
                    {/* Legacy Shopify product URLs → redirect to shop with handle */}
                    <Route path="/products/:handle" element={<LegacyProductRedirect />} />

                    {/* Admin */}
                    <Route path="/admin/packing-list" element={<AdminGuard><AdminPackingList /></AdminGuard>} />
                    <Route path="/admin/login" element={<AdminLoginGuard />} />
                    <Route
                      path="/admin"
                      element={
                        <AdminGuard>
                          <AdminLayout />
                        </AdminGuard>
                      }
                    >
                      <Route index element={<Navigate to="/admin/dashboard" replace />} />
                      <Route path="dashboard" element={<AdminDashboard />} />
                      <Route path="orders" element={<AdminOrders />} />
                      <Route path="operator-stats" element={<AdminOperatorStats />} />
                      <Route path="orders/:id" element={<AdminOrderDetail />} />
                      <Route path="batches" element={<AdminBatches />} />
                      <Route path="batches/:id" element={<AdminBatchDetail />} />
                      <Route path="packing-waves" element={<AdminPackingWaves />} />
                      <Route path="packing-waves/:id" element={<AdminPackingWaveDetail />} />
                      <Route path="packing-waves/:waveId/runs/:runId" element={<AdminPackingRun />} />
                      <Route path="shipping" element={<AdminShipping />} />
                      <Route path="products" element={<AdminProducts />} />
                      <Route path="landing-pages" element={<AdminLandingPages />} />
                      <Route path="products-import" element={<AdminProductsImport />} />
                      <Route path="system-events" element={<AdminSystemEvents />} />
                      <Route path="stockout-demand" element={<AdminStockoutDemand />} />
                      <Route path="courier-import" element={<AdminCourierImport />} />
                      <Route path="courier-import/return-matching" element={<AdminCourierReturnMatching />} />
                      <Route path="courier-import/analytics" element={<AdminCourierAnalytics />} />
                      <Route path="courier-import/mapping" element={<AdminCourierImportMapping />} />
                      <Route path="packing" element={<AdminPacking />} />
                      <Route path="bin-locations" element={<AdminBinLocations />} />
                      
                      <Route path="settings" element={<AdminSettings />} />
                      <Route path="settings/courier-export" element={<CourierExportSettings />} />
                    </Route>

                    <Route path="*" element={<NotFound />} />
                  </Routes>
                  <StickyCartHUD />
                  <CartOverlayRenderer />
                </CheckoutGateProvider>
              </CartOverlayProvider>
            </BrowserRouter>
          </AdminAuthProvider>
        </DeliveryProvider>
      </CartProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
