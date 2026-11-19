-- Database-level integrity triggers complementing Drizzle schema constraints.
-- 1. Prevent overlapping effective periods for active rate_card_items sharing
--    the same (rate_card_id, pricing_key).
-- 2. Enforce immutability of issued invoice monetary/tax snapshots.
-- 3. Prevent hard-deletion of orders, issued invoices, payments, and refunds.

CREATE TRIGGER `trg_rci_no_overlap_insert`
BEFORE INSERT ON `rate_card_items`
WHEN NEW.`is_active` = 1
BEGIN
  SELECT RAISE(ABORT, 'Overlapping effective period for rate_card_items pricing_key')
  WHERE EXISTS (
    SELECT 1
    FROM `rate_card_items` AS existing
    WHERE existing.`rate_card_id` = NEW.`rate_card_id`
      AND existing.`pricing_key` = NEW.`pricing_key`
      AND existing.`is_active` = 1
      AND (existing.`effective_to` IS NULL OR existing.`effective_to` >= NEW.`effective_from`)
      AND (NEW.`effective_to` IS NULL OR NEW.`effective_to` >= existing.`effective_from`)
  );
END;

CREATE TRIGGER `trg_rci_no_overlap_update`
BEFORE UPDATE ON `rate_card_items`
WHEN NEW.`is_active` = 1
BEGIN
  SELECT RAISE(ABORT, 'Overlapping effective period for rate_card_items pricing_key')
  WHERE EXISTS (
    SELECT 1
    FROM `rate_card_items` AS existing
    WHERE existing.`id` != NEW.`id`
      AND existing.`rate_card_id` = NEW.`rate_card_id`
      AND existing.`pricing_key` = NEW.`pricing_key`
      AND existing.`is_active` = 1
      AND (existing.`effective_to` IS NULL OR existing.`effective_to` >= NEW.`effective_from`)
      AND (NEW.`effective_to` IS NULL OR NEW.`effective_to` >= existing.`effective_from`)
  );
END;

CREATE TRIGGER `trg_invoices_immutable_financials`
BEFORE UPDATE ON `invoices`
WHEN OLD.`status` != 'draft'
  AND (
    NEW.`subtotal_paise` != OLD.`subtotal_paise`
    OR NEW.`discount_paise` != OLD.`discount_paise`
    OR NEW.`taxable_amount_paise` != OLD.`taxable_amount_paise`
    OR NEW.`cgst_paise` != OLD.`cgst_paise`
    OR NEW.`sgst_paise` != OLD.`sgst_paise`
    OR NEW.`igst_paise` != OLD.`igst_paise`
    OR NEW.`total_tax_paise` != OLD.`total_tax_paise`
    OR NEW.`total_amount_paise` != OLD.`total_amount_paise`
    OR NEW.`supplier_state_code` != OLD.`supplier_state_code`
    OR NEW.`place_of_supply_state_code` != OLD.`place_of_supply_state_code`
    OR NEW.`tax_supply_type` != OLD.`tax_supply_type`
    OR NEW.`invoice_number` != OLD.`invoice_number`
  )
BEGIN
  SELECT RAISE(ABORT, 'Issued invoice financial and GST snapshot fields are immutable');
END;

CREATE TRIGGER `trg_invoices_no_delete`
BEFORE DELETE ON `invoices`
WHEN OLD.`status` != 'draft'
BEGIN
  SELECT RAISE(ABORT, 'Issued invoices cannot be hard-deleted');
END;

CREATE TRIGGER `trg_orders_no_delete`
BEFORE DELETE ON `orders`
BEGIN
  SELECT RAISE(ABORT, 'Orders cannot be hard-deleted');
END;

CREATE TRIGGER `trg_payments_no_delete`
BEFORE DELETE ON `payments`
BEGIN
  SELECT RAISE(ABORT, 'Payments cannot be hard-deleted');
END;

CREATE TRIGGER `trg_refunds_no_delete`
BEFORE DELETE ON `refunds`
BEGIN
  SELECT RAISE(ABORT, 'Refunds cannot be hard-deleted');
END;
