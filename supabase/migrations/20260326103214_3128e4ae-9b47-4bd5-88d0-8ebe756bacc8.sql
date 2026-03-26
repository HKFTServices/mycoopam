-- Fix Account Creation Successful: remove stray {{user_name}} after signature
UPDATE communication_templates
SET body_html = '<p>Dear&nbsp;{{user_name}}</p><p>We&nbsp;have&nbsp;received&nbsp;your&nbsp;application&nbsp;for&nbsp;membership&nbsp;with&nbsp;{{tenant_name}}&nbsp;in&nbsp;the&nbsp;name&nbsp;of&nbsp;{{entity_account_name}}.&nbsp;To&nbsp;activate&nbsp;your&nbsp;membership&nbsp;please&nbsp;make&nbsp;your&nbsp;first&nbsp;deposit&nbsp;into&nbsp;our&nbsp;bank&nbsp;account,&nbsp;as&nbsp;follows:&nbsp;{{Tenant.LegalEntityBankDetails}}.&nbsp;Use&nbsp;Deposit&nbsp;Reference:&nbsp;{{entity_account_name}}.&nbsp;Your&nbsp;membership&nbsp;will&nbsp;be&nbsp;provisionally&nbsp;accepted.&nbsp;But,&nbsp;if&nbsp;for&nbsp;any&nbsp;reason,&nbsp;your&nbsp;membership&nbsp;is&nbsp;rejected,&nbsp;your&nbsp;full&nbsp;deposit&nbsp;will&nbsp;be&nbsp;refunded&nbsp;within&nbsp;48&nbsp;hours.&nbsp;On&nbsp;the&nbsp;receipt&nbsp;of&nbsp;your&nbsp;first&nbsp;deposit,&nbsp;your&nbsp;membership&nbsp;number&nbsp;will&nbsp;be&nbsp;assigned.&nbsp;Other&nbsp;payment&nbsp;methods:&nbsp;If&nbsp;you&nbsp;want&nbsp;to&nbsp;pay&nbsp;with&nbsp;Debit&nbsp;Order,&nbsp;please&nbsp;download&nbsp;the&nbsp;Debit&nbsp;Order&nbsp;form&nbsp;and&nbsp;send&nbsp;the&nbsp;completed&nbsp;form&nbsp;to&nbsp;us&nbsp;by&nbsp;email.&nbsp;For&nbsp;more&nbsp;information,&nbsp;feel&nbsp;free&nbsp;to&nbsp;visit&nbsp;our&nbsp;website&nbsp;or&nbsp;call&nbsp;us.</p><p>{{email_signature}}</p>'
WHERE id = '770ef266-f4a0-44ae-b78d-9eeb7c3aa5df';

-- Fix First Membership Dep Funds: {{Name}} -> {{tenant_name}}, add salutation, signature, fix subject
UPDATE communication_templates
SET subject = '{{tenant_name}} : Membership Approved : {{entity_account_name}}',
    body_html = '<p>Dear {{user_name}} {{user_surname}}</p><p>Welcome to {{tenant_name}}.</p><p>Your membership has been approved. Your membership number is <b>{{account_number}}</b> under account name {{entity_account_name}}.</p><p>Your deposit has been allocated and you should have received your statement confirming the transaction.</p><p>To view your values and change your personal details, log in at the following link: </p><a href=''https://mycoopam.lovable.app/auth''>Click here</a><p>{{email_signature}}</p>'
WHERE id = '0f57dba1-0535-49b4-aa43-924d7c0c98a7';

-- Fix First Membership Dep Metal: same fixes
UPDATE communication_templates
SET subject = '{{tenant_name}} : Membership Approved : {{entity_account_name}}',
    body_html = '<p>Dear {{user_name}} {{user_surname}}</p><p>Welcome to {{tenant_name}}.</p><p>Your membership has been approved. Your membership number is <b>{{account_number}}</b> under account name {{entity_account_name}}.</p><p>Your deposit has been allocated and you should have received your statement confirming the transaction.</p><p>To view your values and change your personal details, log in at the following link: </p><a href=''https://mycoopam.lovable.app/auth''>Click here</a><p>{{email_signature}}</p>'
WHERE id = '6f9b35d6-f54e-40b3-8fa2-d2a5fccf76e2';

-- Fix Termination of Membership: add salutation, tenant name, signature, fix subject
UPDATE communication_templates
SET subject = '{{tenant_name}} : Termination of Membership : {{entity_account_name}}',
    body_html = '<p>Dear {{user_name}} {{user_surname}}</p><p>As requested, your membership with {{tenant_name}} has been terminated and your share/membership fee amount paid out with your last withdrawal.</p><p>Your name will be removed from our distribution list. Should you wish to continue receiving market related news, kindly inform us within 5 working days.</p><p>Thank you for your participation. You may join again in future by simply depositing your membership fee again.</p><p>{{email_signature}}</p>'
WHERE id = '747ebab1-1d12-4d89-8974-750d45ef1e12';

-- Fix Transaction Confirmation: {{first_name}} {{last_name}} -> {{user_name}} {{user_surname}}
UPDATE communication_templates
SET body_html = '<h2><span style="color: rgb(26, 26, 46);">Transaction Confirmation</span></h2><p>Dear {{user_name}} {{user_surname}},</p><p>Your <strong>{{transaction_type}}</strong> transaction has been successfully processed.</p><table style="border: 1px solid #000;"><tbody><tr><td><span style="color: rgb(102, 102, 102);">Date:</span></td><td>{{transaction_date}}</td></tr><tr><td><span style="color: rgb(102, 102, 102);">Type:</span></td><td>{{transaction_type}}</td></tr><tr><td><span style="color: rgb(102, 102, 102);">Member:</span></td><td>{{entity_account_name}}</td></tr><tr><td><span style="color: rgb(102, 102, 102);">Member Number:</span></td><td>{{account_number}}</td></tr><tr><td><span style="color: rgb(102, 102, 102);">Reference:</span></td><td>{{reference}}</td></tr></tbody></table><p>Please refer to your latest statement for full details reflecting this transaction.</p><p>Best regards,</p><p>{{email_signature}}</p>'
WHERE id = 'fdf76d92-d497-48bd-a81e-c9dca4d29c27';
