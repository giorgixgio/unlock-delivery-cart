

## Fix Bulk SKU Upload — Handle Swaps and Empty Rows

### Problem
The bulk SKU upload in Product Management flags ~740 false errors on a valid 458-row file because:
1. **552 "empty" rows**: Excel trailing blank rows are parsed and shown as errors.
2. **191 "conflict" rows**: The file is a full SKU reassignment (e.g., "217 to 1" and "1 to 182"). The validator sees that new_sku "1" already exists in the catalog, but doesn't realize that SKU "1" is being freed up by another row in the same file.

### Solution

**File: `src/pages/admin/AdminProducts.tsx`** — update the `handleBulkFile` validation logic:

1. **Auto-trim empty rows**: After parsing, filter out rows where both `oldSku` and `newSku` are empty. Never show them in the results.

2. **Swap-aware conflict detection**: Build a Set of all old_sku values in the file. When checking if a new_sku "conflicts" with an existing catalog SKU, also check if that existing SKU is in the old_sku set (meaning it will be freed up). If yes, mark it as "matched" (swap), not "conflict".

### Technical Detail

```
// Before conflict check, build a set of all old SKUs being replaced
const oldSkuSet = new Set(
  dataRows.map(r => String(r[oldSkuIdx] || "").trim().toLowerCase()).filter(Boolean)
);

// In the conflict check:
const conflict = skuMap.get(newSku.toLowerCase());
if (conflict && conflict.productId !== match.productId) {
  // If the conflicting SKU is itself being reassigned in this file, it's a swap — allow it
  if (oldSkuSet.has(newSku.toLowerCase())) {
    // OK — this SKU will be freed up by another row
  } else {
    return { ...conflict error... };
  }
}
```

After this fix, the same file should show ~458 matched rows (minus any genuinely missing SKUs) and zero empty/conflict noise.

