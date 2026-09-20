# Fix: site data and admin login are down

## Reason

Nothing is broken in the site itself. The hosted database that stores your products, orders and logins is **paused**. Every request the site makes to it fails instantly ("Load failed"), which is why:

- the shop shows no products
- you were signed out of the TrendMart admin and cannot sign back in

## Fix

1. Resume the paused backend.
2. Wait until it reports healthy.
3. Verify: load the storefront (products appear) and sign in to the admin.

No code changes are needed. If products still look stale right after, a page refresh clears the locally cached catalog.
