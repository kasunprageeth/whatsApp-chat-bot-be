-- Add human takeover columns to messages table
ALTER TABLE messages ADD COLUMN IF NOT EXISTS human_takeover BOOLEAN DEFAULT false;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_manual_reply BOOLEAN DEFAULT false;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS agent_id UUID;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS takeover_started_at TIMESTAMP;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS takeover_ended_at TIMESTAMP;

-- Create conversations table to track conversation state
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  customer_number VARCHAR(20) NOT NULL,
  status VARCHAR(20) DEFAULT 'bot_mode' CHECK (status IN ('bot_mode', 'human_takeover', 'closed')),
  human_takeover BOOLEAN DEFAULT false,
  agent_id UUID,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, customer_number)
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_customer_number ON conversations(customer_number);
CREATE INDEX IF NOT EXISTS idx_messages_customer_number ON messages(customer_number);
CREATE INDEX IF NOT EXISTS idx_messages_human_takeover ON messages(human_takeover);
