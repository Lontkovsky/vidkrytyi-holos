ALTER TABLE attempts ALTER COLUMN subject DROP NOT NULL;
ALTER TABLE attempts ADD COLUMN session_token_sealed text;
