-- Multi-Tenant Implementation with Row Level Security (RLS)
-- This migration adds RLS policies to enforce tenant isolation

-- ============================================================================
-- MESSAGES TABLE - Add Tenant Isolation
-- ============================================================================

-- Ensure user_id column exists in messages table
ALTER TABLE messages ADD COLUMN IF NOT EXISTS user_id UUID;

-- Add foreign key constraint
ALTER TABLE messages 
ADD CONSTRAINT fk_messages_user_id 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create index for tenant queries
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_user_customer ON messages(user_id, customer_number);

-- Enable Row Level Security (RLS) on messages table
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own messages
CREATE POLICY IF NOT EXISTS messages_isolation ON messages FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- CONVERSATIONS TABLE - Add Tenant Isolation
-- ============================================================================

-- Ensure user_id column exists in conversations table
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS user_id UUID;

-- Add foreign key constraint
ALTER TABLE conversations 
ADD CONSTRAINT fk_conversations_user_id 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create index for tenant queries
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user_customer ON conversations(user_id, customer_number);

-- Ensure unique constraint per tenant
ALTER TABLE conversations 
DROP CONSTRAINT IF EXISTS conversations_user_id_customer_number_key CASCADE;

ALTER TABLE conversations 
ADD CONSTRAINT unique_user_customer 
UNIQUE(user_id, customer_number);

-- Enable Row Level Security (RLS) on conversations table
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own conversations
CREATE POLICY IF NOT EXISTS conversations_isolation ON conversations FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- AUTO_REPLIES TABLE - Add Tenant Isolation (Optional)
-- ============================================================================

-- Ensure user_id column exists in auto_replies table
ALTER TABLE auto_replies ADD COLUMN IF NOT EXISTS user_id UUID;

-- Add foreign key constraint
ALTER TABLE auto_replies 
ADD CONSTRAINT fk_auto_replies_user_id 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create index for tenant queries
CREATE INDEX IF NOT EXISTS idx_auto_replies_user_id ON auto_replies(user_id);

-- Enable Row Level Security (RLS) on auto_replies table
ALTER TABLE auto_replies ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own auto-replies
CREATE POLICY IF NOT EXISTS auto_replies_isolation ON auto_replies FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- IMPORTANT NOTES
-- ============================================================================
-- 
-- 1. After running this migration:
--    - All existing records MUST have user_id set (or they'll be hidden by RLS)
--    - Update existing messages: UPDATE messages SET user_id = 'YOUR_USER_UUID' WHERE user_id IS NULL
--    - Update existing conversations: UPDATE conversations SET user_id = 'YOUR_USER_UUID' WHERE user_id IS NULL
--    - Update existing auto_replies: UPDATE auto_replies SET user_id = 'YOUR_USER_UUID' WHERE user_id IS NULL
--
-- 2. RLS provides defense-in-depth:
--    - Prevents data leakage if middleware is bypassed
--    - Automatically filters data at database level
--    - Requires valid JWT token from Supabase Auth
--
-- 3. User IDs come from:
--    - JWT Bearer Token: auth.uid() from Supabase Auth
--    - x-user-id header: validated in middleware (legacy support)
--
-- 4. Testing:
--    curl -H "Authorization: Bearer YOUR_JWT_TOKEN" http://localhost:3000/api/messages
--    or (legacy)
--    curl -H "x-user-id: YOUR_USER_UUID" http://localhost:3000/api/messages
