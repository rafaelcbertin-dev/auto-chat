-- Várias contas do Instagram (ex.: Terravo Origem e Ampliar).
-- Cada automação passa a valer para uma conta; NULL = todas as contas.
ALTER TABLE automations ADD COLUMN account_id TEXT;
-- Última conta com que a pessoa falou (respostas manuais saem por ela).
ALTER TABLE contacts ADD COLUMN account_id TEXT;

-- O que já existe pertence à conta conectada hoje.
UPDATE automations
   SET account_id = (SELECT json_extract(value, '$.accountId') FROM settings WHERE key = 'instagram_connection')
 WHERE channel = 'instagram';
UPDATE contacts
   SET account_id = (SELECT json_extract(value, '$.accountId') FROM settings WHERE key = 'instagram_connection')
 WHERE channel = 'instagram';

-- A conexão única vira a lista de contas.
INSERT INTO settings (key, value, updated_at)
SELECT 'instagram_accounts', json_array(json(value)), updated_at FROM settings WHERE key = 'instagram_connection'
ON CONFLICT(key) DO NOTHING;
DELETE FROM settings WHERE key = 'instagram_connection';
