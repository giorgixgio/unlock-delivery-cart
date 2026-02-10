import { Upload } from "lucide-react";

const AdminShipping = () => (
  <div className="p-6 space-y-6">
    <h1 className="text-2xl font-extrabold text-foreground">Shipping</h1>

    {/* Tracking Import - Placeholder */}
    <div className="bg-card rounded-lg p-6 border border-border border-dashed space-y-3 opacity-60">
      <div className="flex items-center gap-3">
        <Upload className="w-6 h-6 text-muted-foreground" />
        <div>
          <h3 className="font-bold text-foreground">Courier Tracking Import</h3>
          <p className="text-sm text-muted-foreground">Coming soon — upload courier Excel, match by Order ID (Column H), update tracking fields and mark fulfilled.</p>
        </div>
      </div>
      <div className="bg-muted/50 rounded-lg p-4">
        <p className="text-xs text-muted-foreground space-y-1">
          <strong>How it will work:</strong><br />
          1. Upload the courier response Excel file<br />
          2. System matches orders by Column H (internal UUID)<br />
          3. Updates tracking_number, courier_name, tracking_url<br />
          4. Marks orders as fulfilled when tracking confirms shipped/delivered
        </p>
      </div>
    </div>
  </div>
);

export default AdminShipping;
