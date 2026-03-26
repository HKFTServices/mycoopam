
-- 1. User Registration Completed (AF) - ab842fc1
UPDATE public.communication_templates
SET subject = '{{tenant_name}} : {{user_name}} {{user_surname}} : Gebruiker suksesvol geregistreer',
    body_html = '<p>Beste {{user_name}} {{user_surname}}</p><p>U het suksesvol as gebruiker geregistreer by <strong>{{tenant_name}}</strong>.</p><p>Teken asseblief in met u gebruikersnaam en wagwoord en kies <strong>My Rekeninge</strong> en kies <strong>Maak Rekening Oop</strong> om aansoek te doen vir lidmaatskap indien u nog nie vir uself ''n rekening oopgemaak het nie.</p><p>Indien u in u eie naam ''n rekening wil oopmaak, kies <strong>Myself</strong> of andersins kies <strong>Vir Ander Persoon of Entiteit</strong> indien u byvoorbeeld vir ''n maatskappy of trust of ander entiteit waaroor u magtiging het ''n rekening oop te maak.</p><p>Vir meer inligting, besoek gerus ons webwerf of bel ons.</p><p>{{email_signature}}</p>'
WHERE id = 'ab842fc1-baa6-43e6-a91f-78586234c0fc';

-- 2. Account Creation Successful (AF) - b5f21bfe
UPDATE public.communication_templates
SET subject = '{{tenant_name}} : Aansoek vir lidmaatskap : {{entity_account_name}}',
    body_html = '<p>Beste {{user_name}}</p><p>Ons het u aansoek vir lidmaatskap by {{tenant_name}} ontvang in die naam van {{entity_account_name}}. Om u lidmaatskap te aktiveer, maak asseblief u eerste deposito in ons bankrekening, soos volg: {{Tenant.LegalEntityBankDetails}}. Gebruik Deposito Verwysing: {{entity_account_name}}. U lidmaatskap sal voorlopig aanvaar word. Indien u lidmaatskap om enige rede verwerp word, sal u volle deposito binne 48 uur terugbetaal word. Met die ontvangs van u eerste deposito sal u lidmaatskapnommer toegeken word. Ander betaalmetodes: Indien u per Debietorder wil betaal, laai asseblief die Debietordervorm af en stuur die voltooide vorm per e-pos aan ons. Vir meer inligting, besoek gerus ons webwerf of bel ons.</p><p>{{email_signature}}</p>'
WHERE id = 'b5f21bfe-b224-423c-920f-e4d837387eed';

-- 3. First Membership Dep Funds (AF) - 48e29a82
UPDATE public.communication_templates
SET subject = '{{tenant_name}} : Lidmaatskap Goedgekeur : {{entity_account_name}}',
    body_html = '<p>Beste {{user_name}} {{user_surname}}</p><p>Baie welkom by {{tenant_name}}.</p><p>U lidmaatskap is goedgekeur. U lidmaatskapnommer is <strong>{{account_number}}</strong> onder rekeningnaam {{entity_account_name}}.</p><p>U deposito is geallokeer en u sou u staat ontvang het wat die transaksie bevestig.</p><p>{{email_signature}}</p>'
WHERE id = '48e29a82-94e8-4c72-af83-a5df07285248';

-- 4. First Membership Dep Metal (AF) - 857da137
UPDATE public.communication_templates
SET subject = '{{tenant_name}} : Lidmaatskap Goedgekeur : {{entity_account_name}}',
    body_html = '<p>Beste {{user_name}} {{user_surname}}</p><p>Baie welkom by {{tenant_name}}.</p><p>U lidmaatskap is goedgekeur. U lidmaatskapnommer is <strong>{{account_number}}</strong> onder rekeningnaam {{entity_account_name}}.</p><p>U deposito is geallokeer en u sou u staat ontvang het wat die transaksie bevestig.</p><p>{{email_signature}}</p>'
WHERE id = '857da137-f566-4541-9885-67f0095a6c5b';

-- 5. Termination of Membership (AF) - c23b5b91
UPDATE public.communication_templates
SET subject = '{{tenant_name}} : Terminasie van Lidmaatskap : {{entity_account_name}}',
    body_html = '<p>Beste {{user_name}} {{user_surname}}</p><p>Soos versoek word u lidmaatskap by {{tenant_name}} hiermee beëindig en u aandeel/lidmaatskapfooi word terugbetaal saam met u laaste onttrekking.</p><p>U besonderhede word ook hiermee verwyder van ons verspreidingslys, maar sou u verkies om steeds markverwante nuus te ontvang kan u ons inlig binne die volgende 5 werksdae.</p><p>Dankie vir u deelname en u is welkom om weer u lidmaatskap op te neem deur bloot u lidmaatskapfooi te betaal.</p><p>{{email_signature}}</p>'
WHERE id = 'c23b5b91-7c86-4319-af67-b34cd25e53fe';

-- 6. Transaction Confirmation (AF) - ff8534c0
UPDATE public.communication_templates
SET subject = '{{transaction_type}} Bevestiging — {{account_number}}',
    body_html = '<h2><span style="color: rgb(26, 26, 46);">Transaksie Bevestiging</span></h2><p>Beste {{user_name}} {{user_surname}},</p><p>U <strong>{{transaction_type}}</strong>-transaksie is suksesvol verwerk.</p><table style="border: 1px solid #000;"><tbody><tr><td><span style="color: rgb(102, 102, 102);">Datum:</span></td><td>{{transaction_date}}</td></tr><tr><td><span style="color: rgb(102, 102, 102);">Tipe:</span></td><td>{{transaction_type}}</td></tr><tr><td><span style="color: rgb(102, 102, 102);">Lid:</span></td><td>{{entity_account_name}}</td></tr><tr><td><span style="color: rgb(102, 102, 102);">Lid Nommer:</span></td><td>{{account_number}}</td></tr><tr><td><span style="color: rgb(102, 102, 102);">Verwysing:</span></td><td>{{reference}}</td></tr></tbody></table><p>Verwys asseblief na u jongste staat vir volledige besonderhede van hierdie transaksie.</p><p>{{email_signature}}</p>'
WHERE id = 'ff8534c0-e78d-4598-aecf-e03917825328';
