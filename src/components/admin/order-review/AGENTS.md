# order-review rules

- Operator order-review UI (address fields, item editor, previous orders) lives in `src/components/admin/order-review/` and is shared by OrderQuickReviewModal and the Call Queue, so both screens keep identical save/edit rules; confirm-address validation is the pure `validateConfirmAddress` and applies only to those two confirm paths.
