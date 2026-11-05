# src/lib rules

- Replacements (free resend for a delivered order, no pickup/restock) are created only via the `create_replacement_order` RPC, rules mirrored in pure `src/lib/replacementRules.ts`: the replacement is an `is_return` order tagged `replacement` linked by `original_order_id`, and the lead closes as `merged` with `merged_into_order_id` + tag `converted_to_replacement`, because merged leads are already excluded from queue, stock and cancel stats.
