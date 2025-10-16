-- Migration: 001 - Initial Schema
-- Date: 2025-10-14
-- Description: Create core tables for multi-tenant browser session management

-- ============================================================================
-- UP Migration: Create tables
-- ============================================================================

-- Users table
CREATE TABLE IF NOT EXISTS mcp_users (
  user_id VARCHAR(255) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  username VARCHAR(255) NOT NULL,
  registered_at BIGINT NOT NULL,
  updated_at BIGINT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for users
CREATE INDEX IF NOT EXISTS idx_email ON mcp_users(email);
CREATE INDEX IF NOT EXISTS idx_registered_at ON mcp_users(registered_at DESC);

-- Browsers table
CREATE TABLE IF NOT EXISTS mcp_browsers (
  browser_id UUID PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  browser_url VARCHAR(2048) NOT NULL,
  token_name VARCHAR(255) NOT NULL,
  token VARCHAR(255) UNIQUE NOT NULL,
  created_at_ts BIGINT NOT NULL,
  last_connected_at BIGINT,
  tool_call_count INTEGER DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES mcp_users(user_id) ON DELETE CASCADE
);

-- Indexes for browsers
CREATE INDEX IF NOT EXISTS idx_token ON mcp_browsers(token);
CREATE INDEX IF NOT EXISTS idx_user_id ON mcp_browsers(user_id);
CREATE INDEX IF NOT EXISTS idx_last_connected ON mcp_browsers(last_connected_at DESC);

-- Comments
COMMENT ON TABLE mcp_users IS 'MCP user management table';
COMMENT ON TABLE mcp_browsers IS 'MCP browser instances table';

-- ============================================================================
-- DOWN Migration: Drop tables (for rollback support)
-- ============================================================================
-- To enable rollback: execute these statements manually or via migration tool

-- DROP INDEX IF EXISTS idx_last_connected;
-- DROP INDEX IF EXISTS idx_user_id;
-- DROP INDEX IF EXISTS idx_token;
-- DROP TABLE IF EXISTS mcp_browsers CASCADE;

-- DROP INDEX IF EXISTS idx_registered_at;
-- DROP INDEX IF EXISTS idx_email;
-- DROP TABLE IF EXISTS mcp_users CASCADE;
