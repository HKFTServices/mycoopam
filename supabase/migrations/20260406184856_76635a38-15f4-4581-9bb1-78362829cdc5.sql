UPDATE communication_templates
SET subject = '{{tenant_name}} : {{user_name}} {{user_surname}} : User successfully registered',
    body_html = '<p>Dear {{user_name}} {{user_surname}}</p><p>You have successfully registered as a user with <strong>{{tenant_name}}</strong>.</p><p>Please log in with your username and password and complete the following steps:</p><ol><li><strong>Complete your profile</strong> – update your personal details and contact information.</li><li><strong>Upload required documents</strong> – such as your ID document and proof of address.</li><li><strong>Accept the terms and conditions</strong> – review and digitally sign the required agreements.</li></ol><p>Once your registration has been reviewed and approved by the administrator, you will be able to apply for membership.</p><p>{{email_signature}}</p>'
WHERE application_event = 'user_registration_completed'
AND language_code = 'en'
AND subject LIKE '%Exciting News%';