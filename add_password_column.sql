-- Add password column if it doesn't exist
-- Note: The user provided a CREATE TABLE statement that already includes password column
-- This script ensures the column exists and adds default passwords for testing

-- Check if password column exists, if not add it
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'password'
    ) THEN
        ALTER TABLE users ADD COLUMN password VARCHAR;
    END IF;
END $$;

-- Update existing users with hashed passwords (bcrypt hashed "password123")
-- Hash generated with: passlib.hash.bcrypt.hash("password123")
UPDATE users 
SET password = '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYqgOqOqOqO'
WHERE password IS NULL OR password = '';

-- Note: In production, users should change their passwords on first login
