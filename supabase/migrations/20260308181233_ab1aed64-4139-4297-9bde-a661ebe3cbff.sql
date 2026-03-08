
-- Gold items (KR, K10) → Zero Rated tax
UPDATE public.items SET
  api_code = 'XAU',
  api_link = 'https://www.goldapi.io',
  api_key = 'goldapi-d1e9smlivywts-io',
  calculate_price_with_factor = 1.05,
  price_formula = 'XAU * 1.05',
  tax_type_id = '99e8c05d-6589-435e-abf1-833a9384fd1d',
  show_item_price_on_statement = true
WHERE id = '815eb5c7-f117-4a55-8724-2e1e5de50a5b' AND tenant_id = '38e204c4-829f-4544-ab53-b2f3f5342662';

UPDATE public.items SET
  api_code = 'XAU',
  api_link = 'https://www.goldapi.io',
  api_key = 'goldapi-d1e9smlivywts-io',
  calculate_price_with_factor = 0.11,
  margin_percentage = 1,
  price_formula = 'XAU / 10 * 1.09',
  tax_type_id = '99e8c05d-6589-435e-abf1-833a9384fd1d',
  show_item_price_on_statement = true
WHERE id = 'e915401b-6be8-40f9-9898-ec391f693181' AND tenant_id = '38e204c4-829f-4544-ab53-b2f3f5342662';

-- Silver items (SILONZ, SILVGR, SLVKG) → VAT 15% tax
UPDATE public.items SET
  api_code = 'XAG',
  api_link = 'https://www.goldapi.io',
  api_key = 'goldapi-d1e9smlivywts-io',
  calculate_price_with_factor = 1.08,
  price_formula = 'XAG * 1.08 + 50',
  tax_type_id = 'baef3fb3-2306-4c67-9af0-1878292b3f04',
  show_item_price_on_statement = true
WHERE id = '4f3a6c48-9c95-4298-b6ce-84d70be56bb8' AND tenant_id = '38e204c4-829f-4544-ab53-b2f3f5342662';

UPDATE public.items SET
  api_code = 'XAG',
  api_link = 'https://www.goldapi.io',
  api_key = 'goldapi-d1e9smlivywts-io',
  calculate_price_with_factor = 0.0347267,
  price_formula = 'XAG / 31.1 * 1.08',
  tax_type_id = 'baef3fb3-2306-4c67-9af0-1878292b3f04',
  show_item_price_on_statement = true
WHERE id = 'e5766612-ea40-4e5a-a46f-d63fca3df370' AND tenant_id = '38e204c4-829f-4544-ab53-b2f3f5342662';

UPDATE public.items SET
  api_code = 'XAG',
  api_link = 'https://www.goldapi.io',
  api_key = 'goldapi-d1e9smlivywts-io',
  calculate_price_with_factor = 34.7922,
  price_formula = 'XAG * 1.08 * 32.215',
  tax_type_id = 'baef3fb3-2306-4c67-9af0-1878292b3f04',
  show_item_price_on_statement = false
WHERE id = '27ffa895-2b96-4cbe-857d-08d522c8b582' AND tenant_id = '38e204c4-829f-4544-ab53-b2f3f5342662';

-- Crypto items (USDT-M, USDT-R) → Exempt tax
UPDATE public.items SET
  api_code = 'tether',
  api_link = 'https://api.coingecko.com',
  price_formula = 'tether',
  tax_type_id = '1ab5686a-fb73-48dd-ae4e-8333f71d276f'
WHERE id = '0f20886d-5bc9-4323-88a4-9f8493fd9066' AND tenant_id = '38e204c4-829f-4544-ab53-b2f3f5342662';

UPDATE public.items SET
  api_code = 'tether',
  api_link = 'https://api.coingecko.com',
  price_formula = 'tether',
  tax_type_id = '1ab5686a-fb73-48dd-ae4e-8333f71d276f'
WHERE id = '35a25fae-801d-4b1d-bceb-066bc922e914' AND tenant_id = '38e204c4-829f-4544-ab53-b2f3f5342662';

-- Reference price items (XAG, XAU) → mark as deleted + set tax types
UPDATE public.items SET
  tax_type_id = 'baef3fb3-2306-4c67-9af0-1878292b3f04',
  is_deleted = true
WHERE id = 'a52b5853-de5a-4279-b732-f13546ffb32a' AND tenant_id = '38e204c4-829f-4544-ab53-b2f3f5342662';

UPDATE public.items SET
  tax_type_id = '1ab5686a-fb73-48dd-ae4e-8333f71d276f',
  is_deleted = true
WHERE id = 'c0a51afd-b992-4b58-82e5-e1cb6f2f4e93' AND tenant_id = '38e204c4-829f-4544-ab53-b2f3f5342662';

-- Remaining items → Exempt tax type
UPDATE public.items SET
  tax_type_id = '1ab5686a-fb73-48dd-ae4e-8333f71d276f'
WHERE tenant_id = '38e204c4-829f-4544-ab53-b2f3f5342662'
  AND tax_type_id IS NULL;
