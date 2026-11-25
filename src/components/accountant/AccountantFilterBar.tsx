import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type AccountantFilters,
  type GroupByOption,
  type QuickRangeKey,
  type SourceOption,
  type StoreOption,
  getQuickRange,
} from "@/lib/accountantUtils";
import { Search } from "lucide-react";

const QUICK_RANGES: Array<{ key: QuickRangeKey; label: string }> = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "this_week", label: "This week" },
  { key: "last_week", label: "Last week" },
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "this_quarter", label: "This quarter" },
  { key: "this_year", label: "This year" },
  { key: "custom", label: "Custom" },
];

interface Props {
  filters: AccountantFilters;
  onChange: (next: AccountantFilters) => void;
}

const AccountantFilterBar = ({ filters, onChange }: Props) => {
  const handlePreset = (preset: QuickRangeKey) => {
    if (preset === "custom") {
      onChange({ ...filters, preset: "custom" });
      return;
    }
    const { from, to } = getQuickRange(preset);
    onChange({ ...filters, preset, from, to });
  };

  return (
    <div className="bg-card border border-border rounded-lg p-3 sm:p-4 space-y-3">
      {/* Quick date range pills */}
      <div className="flex flex-wrap items-center gap-1.5">
        {QUICK_RANGES.map((r) => {
          const active = filters.preset === r.key;
          return (
            <button
              key={r.key}
              type="button"
              onClick={() => handlePreset(r.key)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors border ${
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:text-foreground hover:bg-muted/60"
              }`}
            >
              {r.label}
            </button>
          );
        })}
      </div>

      {/* Controls row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 items-end">
        <div>
          <Label className="text-[11px] text-muted-foreground">From (Tbilisi)</Label>
          <Input
            type="date"
            value={filters.from}
            onChange={(e) =>
              onChange({ ...filters, preset: "custom", from: e.target.value })
            }
            className="h-9 text-sm"
          />
        </div>

        <div>
          <Label className="text-[11px] text-muted-foreground">To (Tbilisi)</Label>
          <Input
            type="date"
            value={filters.to}
            onChange={(e) =>
              onChange({ ...filters, preset: "custom", to: e.target.value })
            }
            className="h-9 text-sm"
          />
        </div>

        <div>
          <Label className="text-[11px] text-muted-foreground">Group by</Label>
          <select
            value={filters.groupBy}
            onChange={(e) => onChange({ ...filters, groupBy: e.target.value as GroupByOption })}
            className="h-9 w-full px-2.5 rounded-md border border-input bg-background text-sm"
          >
            <option value="day">Day</option>
            <option value="week">Week (Mon–Sun)</option>
            <option value="month">Month</option>
            <option value="payout_date">Payout date</option>
          </select>
        </div>

        <div>
          <Label className="text-[11px] text-muted-foreground">Store</Label>
          <select
            value={filters.store}
            onChange={(e) => onChange({ ...filters, store: e.target.value as StoreOption })}
            className="h-9 w-full px-2.5 rounded-md border border-input bg-background text-sm"
          >
            <option value="all">All stores</option>
            <option value="TrendMart">TrendMart</option>
            <option value="BigMart">BigMart</option>
          </select>
        </div>

        <div>
          <Label className="text-[11px] text-muted-foreground">Source</Label>
          <select
            value={filters.source}
            onChange={(e) => onChange({ ...filters, source: e.target.value as SourceOption })}
            className="h-9 w-full px-2.5 rounded-md border border-input bg-background text-sm"
          >
            <option value="all">All sources</option>
            <option value="api">API</option>
            <option value="excel">Excel (historic)</option>
          </select>
        </div>

        <div>
          <Label className="text-[11px] text-muted-foreground">SKU / Product</Label>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              value={filters.skuSearch}
              onChange={(e) => onChange({ ...filters, skuSearch: e.target.value })}
              placeholder="Code or title..."
              className="h-9 pl-8 text-sm"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccountantFilterBar;