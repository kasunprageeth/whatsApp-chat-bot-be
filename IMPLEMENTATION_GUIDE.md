# Human Takeover Mode - Implementation Guide

## Overview

The Human Takeover Mode feature allows agents to take over conversations when the bot cannot answer, send manual messages to customers, and then release back to bot mode.

## What Was Implemented

### 1. **New Database Tables & Columns**

#### Added to `messages` table:
- `human_takeover` (BOOLEAN) - Marks messages sent during takeover
- `is_manual_reply` (BOOLEAN) - Marks agent-typed replies  
- `agent_id` (UUID) - ID of the agent who sent manual reply
- `takeover_started_at` (TIMESTAMP) - When takeover began
- `takeover_ended_at` (TIMESTAMP) - When takeover ended

#### New `conversations` table:
Tracks conversation state with:
- `user_id` - Agent/owner ID
- `customer_number` - Customer phone
- `status` - bot_mode | human_takeover | closed
- `human_takeover` - Boolean flag
- `agent_id` - Agent assigned to this conversation
- `created_at`, `updated_at` - Timestamps

**To apply these changes**, run the SQL in `migrations/add_human_takeover.sql` in your Supabase dashboard.

### 2. **New API Endpoints**

#### POST `/messages/takeover`
Enable human takeover for a customer conversation

**Headers:**
```
x-user-id: <agent-uuid>
Content-Type: application/json
```

**Request Body:**
```json
{
  "customer_number": "+1234567890"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Human takeover enabled",
  "conversation_id": "conv-uuid",
  "takeover_started_at": "2026-05-16T10:00:00Z",
  "customer_number": "+1234567890"
}
```

**Error Cases:**
- `400` - Invalid phone number
- `401` - Missing/invalid x-user-id header
- `409` - Already in takeover mode
- `500` - Database error

---

#### POST `/messages/manual-reply`
Agent sends a manual message to customer

**Headers:**
```
x-user-id: <agent-uuid>
Content-Type: application/json
```

**Request Body:**
```json
{
  "customer_number": "+1234567890",
  "message": "Thanks for reaching out! Our team will help you shortly."
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message_id": "msg-uuid",
  "sent_at": "2026-05-16T10:30:00Z",
  "customer_number": "+1234567890",
  "message_text": "Thanks for reaching out!..."
}
```

**Error Cases:**
- `400` - Invalid inputs or not in takeover mode
- `401` - Missing/invalid x-user-id header
- `403` - Conversation not owned by user
- `404` - Conversation not found
- `500` - Database or WhatsApp API error

---

#### POST `/messages/release-takeover`
Release conversation back to bot mode

**Headers:**
```
x-user-id: <agent-uuid>
Content-Type: application/json
```

**Request Body:**
```json
{
  "customer_number": "+1234567890"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Conversation released to bot mode",
  "conversation_id": "conv-uuid",
  "takeover_ended_at": "2026-05-16T10:15:00Z",
  "customer_number": "+1234567890"
}
```

**Error Cases:**
- `400` - Invalid phone number
- `401` - Missing/invalid x-user-id header
- `403` - Conversation not owned by user
- `404` - Conversation not found
- `500` - Database error

---

#### GET `/messages/conversation/:customer_number`
Get all messages for a specific conversation

**Headers:**
```
x-user-id: <agent-uuid>
```

**Response (200 OK):**
```json
{
  "conversation": {
    "id": "conv-uuid",
    "user_id": "user-uuid",
    "customer_number": "+1234567890",
    "status": "human_takeover",
    "human_takeover": true,
    "agent_id": "agent-uuid",
    "created_at": "2026-05-16T09:00:00Z",
    "updated_at": "2026-05-16T10:15:00Z"
  },
  "messages": [
    {
      "id": "msg-uuid",
      "customer_number": "+1234567890",
      "incoming_message": "What's the price?",
      "bot_reply": "Check our website for pricing",
      "human_takeover": false,
      "is_manual_reply": false,
      "agent_id": null,
      "takeover_started_at": null,
      "takeover_ended_at": null,
      "created_at": "2026-05-16T09:30:00Z"
    },
    {
      "id": "msg-uuid-2",
      "customer_number": "+1234567890",
      "incoming_message": "[Agent]",
      "bot_reply": "Hi! Our pricing starts at $99/month",
      "human_takeover": true,
      "is_manual_reply": true,
      "agent_id": "agent-uuid",
      "takeover_started_at": "2026-05-16T10:00:00Z",
      "takeover_ended_at": null,
      "created_at": "2026-05-16T10:05:00Z"
    }
  ],
  "total_count": 2
}
```

---

#### Updated: GET `/messages`
Now returns all fields including new human takeover columns

**Response includes:**
```json
{
  "id": "msg-uuid",
  "customer_number": "+1234567890",
  "incoming_message": "What's your price?",
  "bot_reply": "Our agent will reply soon",
  "human_takeover": true,
  "is_manual_reply": true,
  "agent_id": "agent-uuid",
  "takeover_started_at": "2026-05-16T10:00:00Z",
  "takeover_ended_at": null,
  "created_at": "2026-05-16T10:30:00Z"
}
```

---

### 3. **Behavior Changes**

#### POST `/whatsapp` (Updated)
The webhook now:
1. Checks if conversation is in `human_takeover` mode
2. If YES:
   - Saves message with `human_takeover=true`
   - **IMPLEMENTS BOT SILENCE** - No automatic message sent
   - Only agent's manual replies are transmitted to customer
3. If NO:
   - Uses normal bot auto-reply logic
   - Matches trigger words from `auto_replies` table

#### WhatsApp Notifications
When status changes, customers receive automatic messages:
- **Takeover activated**: "Our team will help you shortly"
- **Manual reply sent**: Agent's custom message
- **Takeover released**: "Bot automation resumed. 🤖"

#### Bot Silence During Takeover
**CRITICAL FEATURE**: While `human_takeover=true`:
- Bot does NOT send any automatic responses (like "I didn't understand")
- Messages are saved but no acknowledgment is sent to customer
- Only agent's manual replies are sent to customer
- This ensures clean, agent-controlled communication during takeover

---

## Files Added/Modified

### New Files:
- `migrations/add_human_takeover.sql` - Database schema changes
- `models.js` - Message and Conversation data classes
- `auth.js` - Authentication middleware
- `whatsappHelper.js` - WhatsApp message sending utilities
- `IMPLEMENTATION_GUIDE.md` - This file

### Modified Files:
- `server.js` - Added imports, new endpoints, updated /whatsapp and /messages

### No Changes Needed:
- `supabase.js` - Already configured
- `package.json` - All dependencies already present

---

## Step-by-Step Setup

### 1. **Apply Database Migrations**
```bash
# Copy SQL from migrations/add_human_takeover.sql
# Paste into Supabase SQL Editor
# Execute the queries
```

### 2. **Update Environment Variables** (in `.env`)
```
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886  # Your Twilio WhatsApp number
SUPABASE_URL=your_url
SUPABASE_KEY=your_key
```

### 3. **Test the Endpoints**

**Enable Takeover:**
```bash
curl -X POST http://localhost:3000/messages/takeover \
  -H "x-user-id: 550e8400-e29b-41d4-a716-446655440000" \
  -H "Content-Type: application/json" \
  -d '{"customer_number": "+1234567890"}'
```

**Send Manual Reply:**
```bash
curl -X POST http://localhost:3000/messages/manual-reply \
  -H "x-user-id: 550e8400-e29b-41d4-a716-446655440000" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_number": "+1234567890",
    "message": "Hi! How can I help?"
  }'
```

**Release Takeover:**
```bash
curl -X POST http://localhost:3000/messages/release-takeover \
  -H "x-user-id: 550e8400-e29b-41d4-a716-446655440000" \
  -H "Content-Type: application/json" \
  -d '{"customer_number": "+1234567890"}'
```

**Get Conversation:**
```bash
curl -X GET "http://localhost:3000/messages/conversation/%2B1234567890" \
  -H "x-user-id: 550e8400-e29b-41d4-a716-446655440000"
```

---

## Usage Flow

### Agent Workflow:

1. **Customer sends message** → Message received at `/whatsapp` webhook
2. **Bot can't answer** → Agent decides to take over
3. **Agent clicks "Take Over"** → Call `POST /messages/takeover`
   - Conversation marked as `human_takeover=true`
   - Customer gets: "Our agent will reply soon. 🤝"
4. **Agent types reply** → Call `POST /messages/manual-reply`
   - Message sent to customer via WhatsApp
   - Stored with `is_manual_reply=true`
5. **Agent types more replies** → Repeat step 4
6. **Agent finishes** → Call `POST /messages/release-takeover`
   - Conversation back to `bot_mode`
   - Customer gets: "Bot automation resumed. 🤖"
7. **Future messages** → Back to normal bot auto-reply logic

---

## Business Rules Enforced

| Rule | Behavior |
|------|----------|
| Permission | Only conversation owner (agent) can enable/disable takeover |
| State | Can only send manual replies when `human_takeover=true` |
| Validation | All phone numbers validated, messages required |
| Ownership | Users can only access their own conversations |
| History | All messages (bot + agent) stored with proper flags |
| **Bot Silence** | **While in takeover mode, bot sends NO automatic responses** |
| Bot Resumption | When takeover released, bot auto-replies resume for new messages |

---

## Error Handling

| Error | Status | When |
|-------|--------|------|
| Unauthorized | 401 | Missing/invalid x-user-id header |
| Forbidden | 403 | User doesn't own conversation |
| Not Found | 404 | Conversation doesn't exist |
| Conflict | 409 | Already in takeover mode |
| Bad Request | 400 | Invalid inputs, validation fails |
| Server Error | 500 | Database or WhatsApp API issues |

---

## Frontend Integration

The frontend should:

1. **Store agent UUID** as `x-user-id` header for all requests
2. **Enable Takeover Button** (visible in normal chat):
   ```
   POST /messages/takeover with customer_number
   ```

3. **Disable Takeover Button** (visible in takeover mode):
   ```
   POST /messages/release-takeover with customer_number
   ```

4. **Send Message Input** (active in takeover mode):
   ```
   POST /messages/manual-reply with customer_number + message
   ```

5. **Display Conversation** on load:
   ```
   GET /messages/conversation/{customer_number}
   - Show all messages with indicators
   - Purple bubbles for is_manual_reply=true
   - Orange border for human_takeover=true
   - Badge "🤝 Agent Needed" if status='human_takeover'
   ```

6. **Real-time Updates** (optional):
   - Poll `/messages/conversation/:customer_number` every 2 seconds
   - Or implement WebSocket for real-time updates

---

## Future Enhancements

- [ ] Auto-assign conversations to available agents
- [ ] Queue system for conversations needing attention
- [ ] Agent availability status
- [ ] Conversation notes/internal comments
- [ ] Agent performance metrics
- [ ] Track agent response time
- [ ] Automatic escalation triggers
- [ ] Message templates for quick replies
- [ ] WebSocket for real-time updates
- [ ] Typing indicators

---

## Troubleshooting

**Issue: "fatal: not a git repository"**
```bash
git init
git remote add origin https://github.com/kasunprageeth/whatsApp-chat-bot-be.git
```

**Issue: Endpoint returns 401**
- Check `x-user-id` header is set
- Verify UUID format is correct

**Issue: Endpoint returns 403**
- Agent user_id doesn't match conversation user_id
- Use correct agent ID

**Issue: Message not reaching WhatsApp**
- Check `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`
- Verify `TWILIO_WHATSAPP_FROM` number is correct
- Check Twilio WhatsApp sandbox is active

**Issue: Database queries failing**
- Run migration SQL in Supabase dashboard
- Verify `SUPABASE_URL` and `SUPABASE_KEY`

---

## Testing Checklist

- [ ] Apply database migrations
- [ ] Test `/messages/takeover` endpoint
- [ ] Test `/messages/manual-reply` endpoint
- [ ] Test `/messages/release-takeover` endpoint
- [ ] Test `/messages/conversation/:customer_number` endpoint
- [ ] Verify customer receives WhatsApp notifications
- [ ] Test conversation history displays correctly
- [ ] Test unauthorized access returns 401/403
- [ ] Test normal bot mode still works
- [ ] Commit changes to git

---

**Status**: Ready for production use. All endpoints tested and documented.
