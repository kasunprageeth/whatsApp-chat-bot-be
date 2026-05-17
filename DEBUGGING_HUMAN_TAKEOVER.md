# Human Takeover Debugging Guide

## Overview
This guide helps you verify if the human takeover feature is working correctly. Follow the steps to test each component.

---

## Quick Diagnosis Checklist

- [ ] **Server running?** Check if Node.js server is running on port 3000
- [ ] **Supabase connected?** Check Supabase credentials in .env
- [ ] **Database tables exist?** Verify conversations & messages tables created
- [ ] **Migrations applied?** Run SQL migrations in Supabase SQL editor
- [ ] **Environment variables set?** Check .env file has all required values
- [ ] **Webhook receiving messages?** Check server logs for incoming /whatsapp requests

---

## Level 1: Basic Connectivity Tests

### Test 1.1: Is the server running?
```bash
# In your terminal, check if port 3000 is listening
lsof -i :3000

# Expected output:
# node      1234 user    10u  IPv4 0x1234567  0t0  TCP localhost:3000 (LISTEN)
```

### Test 1.2: Test server health
```bash
curl http://localhost:3000/

# If you get connection refused, server is not running
# Start it with: node server.js
```

### Test 1.3: Can you get auto-replies?
```bash
curl http://localhost:3000/replies

# Expected: Array of auto-replies
# [{"id": 1, "trigger_word": "hello", "reply_message": "Hi there!"}]
```

---

## Level 2: Database Verification

### Test 2.1: Check if conversations table exists
```sql
-- Run this in Supabase SQL Editor
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public';

-- Should see: conversations, messages, auto_replies, etc.
```

### Test 2.2: Check conversations table schema
```sql
-- Verify all required columns exist
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'conversations'
ORDER BY ordinal_position;

-- Must have: id, user_id, customer_number, human_takeover, status, agent_id, created_at, updated_at
```

### Test 2.3: Check for any existing conversations
```sql
SELECT * FROM conversations LIMIT 10;

-- Shows: existing test conversations or empty table
```

### Test 2.4: Check messages table for takeover records
```sql
SELECT customer_number, human_takeover, bot_reply, created_at 
FROM messages 
ORDER BY created_at DESC 
LIMIT 20;

-- Look for: human_takeover=true entries
```

---

## Level 3: Authentication & Authorization

### Test 3.1: Check if auth middleware is working
```bash
# Without auth header (should fail)
curl -X POST http://localhost:3000/messages/takeover \
  -H "Content-Type: application/json" \
  -d '{"customer_number": "+1234567890"}'

# Expected: 401 Unauthorized
```

### Test 3.2: Check with x-user-id header
```bash
# Using x-user-id header
curl -X POST http://localhost:3000/messages/takeover \
  -H "Content-Type: application/json" \
  -H "x-user-id: 11111111-1111-1111-1111-111111111111" \
  -d '{"customer_number": "+1234567890"}'

# Expected: 200 OK or 404 (depending on setup)
```

### Test 3.3: Check auth.js is loaded
```bash
# Look for auth middleware logs in server output
# When you make a request, you should see:
# "User authenticated with x-user-id" or "JWT verified" in logs
```

---

## Level 4: Full Takeover Flow Test

### Prerequisites
Before testing, set a test user ID:
```bash
TEST_USER_ID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
TEST_PHONE="+1234567890"
```

### Step 1: Enable Human Takeover
```bash
curl -X POST http://localhost:3000/messages/takeover \
  -H "Content-Type: application/json" \
  -H "x-user-id: $TEST_USER_ID" \
  -d "{
    \"customer_number\": \"$TEST_PHONE\"
  }"

# Expected response:
# {
#   "success": true,
#   "message": "Human takeover enabled",
#   "conversation_id": "conv-uuid",
#   "takeover_started_at": "2026-05-18T10:30:00Z",
#   "customer_number": "+1234567890"
# }
```

**What to check in logs:**
```
- "User authenticated with x-user-id: xxxxxxxx..."
- "Creating new conversation" or "Updating existing conversation"
- Supabase insert/update success message
```

### Step 2: Verify in Database
```sql
-- Check conversation was created/updated
SELECT * FROM conversations 
WHERE customer_number = '+1234567890' 
  AND user_id = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';

-- Expected:
-- id | user_id | customer_number | human_takeover | status | agent_id | created_at | updated_at
-- 1  | xxx...  | +1234567890     | true           | human_takeover | xxx... | ... | ...
```

### Step 3: Simulate Incoming Customer Message (During Takeover)
```bash
# Simulate Twilio webhook call
curl -X POST http://localhost:3000/whatsapp \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "Body=Hello I need help&From=whatsapp:%2B1234567890"

# Expected response: 
# Empty XML (<?xml version="1.0"...><Response></Response>)
# This means bot silence is working (no auto-reply sent)
```

**What to check:**
- Server logs should show: "Human takeover active - bot silent"
- Response should NOT contain any message text
- Message should be saved in database with `human_takeover=true`

### Step 4: Verify Message Was Saved
```sql
-- Check if incoming message was saved
SELECT customer_number, incoming_message, bot_reply, human_takeover, is_manual_reply 
FROM messages 
WHERE customer_number = '+1234567890' 
ORDER BY created_at DESC 
LIMIT 5;

-- Expected to see:
-- | +1234567890 | "Hello I need help" | "[Waiting for agent response]" | true | false |
```

### Step 5: Agent Sends Manual Reply
```bash
curl -X POST http://localhost:3000/messages/manual-reply \
  -H "Content-Type: application/json" \
  -H "x-user-id: $TEST_USER_ID" \
  -d "{
    \"customer_number\": \"$TEST_PHONE\",
    \"message\": \"Hi! I'm here to help. What's your issue?\"
  }"

# Expected response:
# {
#   "success": true,
#   "message_id": "msg-uuid",
#   "sent_at": "2026-05-18T10:31:00Z",
#   "customer_number": "+1234567890",
#   "message_text": "Hi! I'm here to help. What's your issue?"
# }
```

**What to check:**
- Message appears in Twilio logs or WhatsApp chat
- Server logs show: "Manual reply sent via WhatsApp"
- Database has message with `is_manual_reply=true`

### Step 6: Release Human Takeover
```bash
curl -X POST http://localhost:3000/messages/release-takeover \
  -H "Content-Type: application/json" \
  -H "x-user-id: $TEST_USER_ID" \
  -d "{
    \"customer_number\": \"$TEST_PHONE\"
  }"

# Expected response:
# {
#   "success": true,
#   "message": "Conversation released to bot mode",
#   "conversation_id": "conv-uuid",
#   "takeover_ended_at": "2026-05-18T10:32:00Z",
#   "customer_number": "+1234567890"
# }
```

### Step 7: Verify Bot Mode Resumed
```bash
# Send another message (should get auto-reply now)
curl -X POST http://localhost:3000/whatsapp \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "Body=hello&From=whatsapp:%2B1234567890"

# Expected: 
# Response contains auto-reply message (NOT empty)
# e.g., <?xml...><Message>Hi there!</Message></Response>
```

**Verify in database:**
```sql
SELECT human_takeover, bot_reply 
FROM messages 
WHERE customer_number = '+1234567890' 
ORDER BY created_at DESC 
LIMIT 1;

-- Expected: human_takeover=false, bot_reply=[matched auto-reply]
```

---

## Level 5: Check Server Logs

### Enable Detailed Logging
Update `server.js` to add more console.logs:

```javascript
// Add at the start of /whatsapp endpoint:
console.log("=== INCOMING MESSAGE ===");
console.log("From:", req.body.From);
console.log("Message:", req.body.Body);
console.log("Time:", new Date().toISOString());

// In takeover check:
console.log("Conversation status - inTakeover:", inTakeover, "userId:", userId);

// Before sending response:
console.log("Sending response - takeover mode:", inTakeover ? "YES (empty)" : "NO (auto-reply)");
```

### View Live Logs
```bash
# Terminal 1: Start server with verbose logging
NODE_ENV=development node server.js

# Terminal 2: Watch logs in real-time
tail -f server.log | grep -E "INCOMING|takeover|CRITICAL"
```

### Expected Log Output

**During Normal Bot Mode:**
```
=== INCOMING MESSAGE ===
From: whatsapp:+1234567890
Message: hello
Time: 2026-05-18T10:30:00.000Z
Conversation not found (first message)
Matching auto-reply for: hello
Matched trigger: hello Reply: Hi there!
Sending response - takeover mode: NO (auto-reply)
```

**During Human Takeover:**
```
=== INCOMING MESSAGE ===
From: whatsapp:+1234567890
Message: I need help
Time: 2026-05-18T10:31:00.000Z
Conversation status - inTakeover: true userId: xxxxxxxx-xxxx...
Saving message during takeover
Sending response - takeover mode: YES (empty)
```

---

## Level 6: Common Issues & Diagnostics

### Issue 1: "Conversation not found" when enabling takeover
**Symptom:** GET returns empty conversations array

**Diagnosis:**
```sql
-- Check if any conversations exist
SELECT COUNT(*) FROM conversations;
-- If 0: That's normal for first test

-- After enabling takeover, should see:
SELECT * FROM conversations;
```

**Fix:** This is expected behavior. After first takeover call, conversation is created.

---

### Issue 2: Bot still replies during takeover
**Symptom:** Customer receives auto-reply even with takeover active

**Diagnosis:**
```javascript
// Add this in /whatsapp endpoint:
console.log("DEBUG - inTakeover:", inTakeover);
console.log("DEBUG - human_takeover value:", conversations[0]?.human_takeover);

// Check database directly:
```

```sql
SELECT human_takeover FROM conversations 
WHERE customer_number = '+1234567890';
-- Should show: true
```

**Common causes:**
1. Conversation query returning wrong customer_number (format issue)
   - Use `SELECT * FROM conversations WHERE customer_number LIKE '%1234567890%'` to find it

2. human_takeover column is NULL instead of boolean
   - Run: `UPDATE conversations SET human_takeover = true WHERE id = '...'`

3. Conversation exists but human_takeover wasn't updated
   - Check the update query succeeded

---

### Issue 3: Manual reply not sent to WhatsApp
**Symptom:** Message saved in database but not received by customer

**Diagnosis:**
```javascript
// Check Twilio client is initialized
console.log("Twilio SID:", process.env.TWILIO_ACCOUNT_SID);
console.log("Twilio From:", process.env.TWILIO_WHATSAPP_FROM);

// Add to sendManualReplyMessage in whatsappHelper.js:
console.log("Sending to:", toNumber, "From:", fromNumber, "Message:", body);
```

**Common causes:**
1. TWILIO_AUTH_TOKEN is invalid or incomplete
2. Recipient number format wrong (should include country code: +1234567890)
3. Twilio account doesn't have active WhatsApp sandbox
4. Twilio daily message limit exceeded

**Verification:**
```bash
# Check Twilio status page
# Check Twilio account active WhatsApp sandbox: https://console.twilio.com

# Test Twilio connection:
curl -X POST https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID/Messages.json \
  -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN" \
  -d "Body=Test&From=$TWILIO_WHATSAPP_FROM&To=whatsapp:+1234567890"
```

---

### Issue 4: Auth middleware rejecting requests
**Symptom:** 401 Unauthorized on takeover API

**Diagnosis:**
```bash
# Check if auth header is present
curl -X POST http://localhost:3000/messages/takeover \
  -H "Content-Type: application/json" \
  -H "x-user-id: test" \
  -d '{"customer_number": "+1234567890"}'

# Check server logs for auth errors
grep -i "auth\|unauthorized" server.log
```

**Common causes:**
1. x-user-id header not provided
2. x-user-id header malformed (not a valid UUID)
3. authMiddleware not applied to route

**Fix:**
```bash
# Always include header:
curl -H "x-user-id: 11111111-1111-1111-1111-111111111111" ...

# Or use JWT Bearer token
curl -H "Authorization: Bearer eyJhbGc..." ...
```

---

### Issue 5: Database RLS policies blocking queries
**Symptom:** Supabase error about row-level security

**Diagnosis:**
```sql
-- Check if RLS is enabled
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename IN ('messages', 'conversations');
-- Should show: true (if RLS enabled)

-- Check RLS policies
SELECT * FROM pg_policies 
WHERE tablename = 'conversations';
```

**If RLS is blocking:**
1. Temporarily disable RLS for testing (not for production)
2. Ensure x-user-id header matches a valid auth.uid() in Supabase
3. Run migrations to create proper RLS policies

---

## Level 7: Step-by-Step Complete Test

```bash
#!/bin/bash

# Set variables
TEST_USER="11111111-1111-1111-1111-111111111111"
TEST_PHONE="+1234567890"
API="http://localhost:3000"

echo "=== HUMAN TAKEOVER DEBUG TEST ==="
echo ""

# Step 1: Enable takeover
echo "STEP 1: Enabling takeover..."
curl -X POST $API/messages/takeover \
  -H "x-user-id: $TEST_USER" \
  -H "Content-Type: application/json" \
  -d "{\"customer_number\": \"$TEST_PHONE\"}" | jq .

sleep 2

# Step 2: Simulate incoming message (should be silent)
echo ""
echo "STEP 2: Simulating incoming message..."
RESPONSE=$(curl -s -X POST $API/whatsapp \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "Body=Help me please&From=whatsapp:%2B1234567890")

if echo "$RESPONSE" | grep -q "<Message>"; then
  echo "❌ FAIL: Bot sent reply (should be silent)"
  echo "$RESPONSE"
else
  echo "✅ PASS: Bot silent (no reply sent)"
fi

sleep 2

# Step 3: Send manual reply
echo ""
echo "STEP 3: Agent sending manual reply..."
curl -X POST $API/messages/manual-reply \
  -H "x-user-id: $TEST_USER" \
  -H "Content-Type: application/json" \
  -d "{\"customer_number\": \"$TEST_PHONE\", \"message\": \"I am here to help!\"}" | jq .

sleep 2

# Step 4: Release takeover
echo ""
echo "STEP 4: Releasing takeover..."
curl -X POST $API/messages/release-takeover \
  -H "x-user-id: $TEST_USER" \
  -H "Content-Type: application/json" \
  -d "{\"customer_number\": \"$TEST_PHONE\"}" | jq .

sleep 2

# Step 5: Test bot replies now
echo ""
echo "STEP 5: Testing bot replies after release..."
RESPONSE=$(curl -s -X POST $API/whatsapp \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "Body=hello&From=whatsapp:%2B1234567890")

if echo "$RESPONSE" | grep -q "<Message>"; then
  echo "✅ PASS: Bot sent reply (takeover ended)"
else
  echo "❌ FAIL: Bot silent (should have auto-replied)"
fi

echo ""
echo "=== TEST COMPLETE ==="
```

---

## Verification Checklist

After completing all tests, verify:

- [ ] Conversation created in `conversations` table
- [ ] During takeover, bot sends empty XML response
- [ ] During takeover, messages saved with `human_takeover=true`
- [ ] Manual replies sent to WhatsApp and saved
- [ ] After release, bot returns to normal auto-reply mode
- [ ] All messages have correct `user_id` for tenant isolation
- [ ] No auth errors in logs
- [ ] No database errors in logs
- [ ] WhatsApp messages received by customer

---

## Quick Troubleshooting Commands

```bash
# Check if server is running
lsof -i :3000

# View server logs
tail -f server.log

# Test Supabase connection
curl https://olhoyoijrdegxmeqzegp.supabase.co/rest/v1/messages?limit=1 \
  -H "apikey: sb_publishable_-5T3V_fkIUHqRj5lvUQBNQ_tqV6978n"

# List all conversations
curl http://localhost:3000/api/messages \
  -H "x-user-id: 11111111-1111-1111-1111-111111111111"

# Check conversation for specific customer
# Replace in browser or curl:
http://localhost:3000/api/messages/conversation/%2B1234567890 \
  -H "x-user-id: 11111111-1111-1111-1111-111111111111"
```

---

**Last Updated:** 2026-05-18  
**Status:** ✅ Complete Debugging Guide
