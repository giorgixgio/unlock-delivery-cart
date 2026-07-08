## Wire up the new Packing feature

1. **Run migration**: apply `supabase/migrations/20260708000000_add_bin_location.sql` via the migration tool.
2. **Edit `supabase/config.toml`**: append
   ```
   [functions.create-packing-session]
   verify_jwt = false
   ```
3. **Edit `src/App.tsx`**:
   - Import `AdminPacking` and `AdminBinLocations` from `./pages/admin/`.
   - Inside the `/admin` route block, add `<Route path="packing" element={<AdminPacking />} />` and `<Route path="bin-locations" element={<AdminBinLocations />} />`.
4. **Edit `src/pages/admin/AdminLayout.tsx`**:
   - Add `PackageCheck` and `MapPin` to the `lucide-react` import.
   - In `navItems`, remove the "Batches" and "Packing Waves" entries and add "Packing" (`/admin/packing`, PackageCheck) and "Bin Locations" (`/admin/bin-locations`, MapPin).
5. **Deploy edge functions** `create-packing-session` and `export-courier` via the deploy tool.
6. **Report back** any errors from migration, deploys, or typecheck; otherwise confirm success.

No other files or behavior are touched.