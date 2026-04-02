
-- Monthly Admin Crypto: credit = Crypto Cash, debit = Admin Cash, GL = Administration Income (4000)
UPDATE income_expense_items SET debit_control_account_id = '79e5a77a-8041-40a7-9e70-d51154c72ac5', credit_control_account_id = '65067671-e16c-4fae-8056-fa041ca23963', gl_account_id = '70f60d57-d64a-4ee8-8370-50303bd3dfd6' WHERE id = '114bace4-8b72-4b1b-8d43-5664906f73f7';

-- Monthly Admin Gold: already has credit (Gold Cash), set debit = Admin Cash, GL = Administration Income
UPDATE income_expense_items SET debit_control_account_id = '79e5a77a-8041-40a7-9e70-d51154c72ac5', gl_account_id = '70f60d57-d64a-4ee8-8370-50303bd3dfd6' WHERE id = '06d75c67-b7b1-46a2-a099-07f5af835cfb';

-- Monthly Admin Member Acc: credit = System Cash, debit = Admin Cash, GL = Administration Income
UPDATE income_expense_items SET debit_control_account_id = '79e5a77a-8041-40a7-9e70-d51154c72ac5', credit_control_account_id = '861c5532-86f4-4e83-bdd5-0d891f7a301d', gl_account_id = '70f60d57-d64a-4ee8-8370-50303bd3dfd6' WHERE id = '1c42f962-dedf-4b3f-9802-2d86cb9dd5b3';

-- Monthly Admin Reserve: credit = System Cash, debit = Admin Cash, GL = Administration Income
UPDATE income_expense_items SET debit_control_account_id = '79e5a77a-8041-40a7-9e70-d51154c72ac5', credit_control_account_id = '861c5532-86f4-4e83-bdd5-0d891f7a301d', gl_account_id = '70f60d57-d64a-4ee8-8370-50303bd3dfd6' WHERE id = '2401becd-d09c-416e-8b1b-77cfce36e55a';

-- Monthly Admin Silver (the one without debit): set debit = Admin Cash, GL = Administration Income
UPDATE income_expense_items SET debit_control_account_id = '79e5a77a-8041-40a7-9e70-d51154c72ac5', gl_account_id = '70f60d57-d64a-4ee8-8370-50303bd3dfd6' WHERE id = 'ac743d59-3169-421b-a013-fb4ad6d3d8fa';

-- Monthy Admin Silver (the typo one, already has both control accounts): set GL = Administration Income
UPDATE income_expense_items SET gl_account_id = '70f60d57-d64a-4ee8-8370-50303bd3dfd6' WHERE id = 'bb71fc27-0e77-4d6b-92a4-a22666dc31cd';
