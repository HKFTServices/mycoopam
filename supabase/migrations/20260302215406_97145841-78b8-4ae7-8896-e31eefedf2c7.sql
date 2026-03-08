-- Add commission_vat column to track VAT separately
-- commission_amount will now store the excl-VAT base amount
-- VAT is only added at payment time if the referral house is VAT registered
ALTER TABLE public.commissions ADD COLUMN commission_vat numeric NOT NULL DEFAULT 0;

-- Update the existing record to isolate VAT (was stored as incl-VAT)
-- Original: commission_amount = 17246.9775 (incl VAT at 15%)
-- Base = 17246.9775 / 1.15 = 14997.37, VAT = 2249.61
UPDATE public.commissions 
SET commission_vat = ROUND(commission_amount - (commission_amount / 1.15), 2),
    commission_amount = ROUND(commission_amount / 1.15, 2)
WHERE id = '91716464-f7a4-4e49-bcb7-91ac2cd923d0' AND status = 'pending';