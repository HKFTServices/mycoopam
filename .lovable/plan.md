

# Fix Legacy Transaction 11431: Split Bank Deposit and Add Loan Installment

## Problem
Legacy transaction 11431 (SJC Hong Kong Foreign Trust, EntityID 213) is a R226,500 bank deposit, but only R206,500 belongs to this entity. The remaining R20,000 is a loan installment for **SJC Testamentary Trust** (EntityID 9) that was bundled into the same bank receipt.

## Data Changes (Two Operations)

### 1. Reduce root bank deposit from R226,500 to R206,500
Update the `notes` JSON on record `0a01292b-46b5-49dd-bb0c-85c068f855e7` (legacy_id 11431) to change the Debit from `226500` to `206500`.

### 2. Insert a new legacy CFT entry for the R20,000 loan installment
Create a new `legacy_id_mappings` row for SJC Testamentary Trust (EntityID 9):
- **legacy_id**: `13926` (next available after current max 13925)
- **table_name**: `cashflow_transactions`
- **tenant_id**: AEM tenant ID
- **parent_id**: `11431` (links to the same bank receipt)
- **entry_type**: `1978` (Loan Installment)
- **EntityID**: `9` (SJC Testamentary Trust)
- **Debit**: `20000`
- **Credit**: `0`
- **TransactionDate**: `2025-02-17`

This ensures:
- The bank deposit for SJC Hong Kong Foreign Trust balances at R206,500 (R1,032.50 fee + R205,467.50 pool allocation)
- The R20,000 loan installment is correctly attributed to SJC Testamentary Trust and will appear in that entity's import batch on the Legacy GL Allocation page

### Technical Detail
Both operations use the Supabase insert tool (UPDATE for step 1, INSERT for step 2) — no schema migration needed.

