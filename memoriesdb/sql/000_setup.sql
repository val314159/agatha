-- Database and User Setup for MemoriesDB
-- ===================================
-- This script should be run as a PostgreSQL superuser (usually 'postgres')
-- Usage: psql -U postgres -f 000_setup.sql

-- Connect to the default database
\c postgres;

-- Drop and recreate the database
DROP DATABASE IF EXISTS memories;
CREATE DATABASE memories;

-- Connect to the new database
\c memories;

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Create a dedicated user (change the password in production!)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'memories_user') THEN
        CREATE USER memories_user WITH PASSWORD 'your_secure_password';
    END IF;
END
$$;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE memories TO memories_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO memories_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO memories_user;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO memories_user;

-- Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public 
    GRANT ALL PRIVILEGES ON TABLES TO memories_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public 
    GRANT ALL PRIVILEGES ON SEQUENCES TO memories_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public 
    GRANT ALL PRIVILEGES ON FUNCTIONS TO memories_user;

-- Notify
\echo ""
\echo "✅ Database 'memories' and user 'memories_user' created successfully!"
\echo "   Remember to update the password in production environments."
\echo "   Next, run the initialization script: psql -U memories_user -d memories -f 000_init.sql"
