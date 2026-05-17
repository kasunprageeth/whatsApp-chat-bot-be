# Quick Reference - Human Takeover Mode API

## Endpoints Summary

| Endpoint | Method | Purpose | Auth |
|----------|--------|---------|------|
| `/messages/takeover` | POST | Enable human takeover | x-user-id |
| `/messages/release-takeover` | POST | Release back to bot | x-user-id |
| `/messages/manual-reply` | POST | Send agent message | x-user-id |
| `/messages/conversation/:number` | GET | Get conversation history | x-user-id |
| `/messages` | GET | Get all messages | No |
| `/whatsapp` | POST | WhatsApp webhook | Twilio |
| `/replies` | GET | Get auto-replies | No |
| `/replies` | POST | Create auto-reply | No |

---

## Quick Examples

### 1. Enable Takeover
```bash
curl -X POST http://localhost:3000/messages/takeover \
  -H "x-user-id: 550e8400-e29b-41d4-a716-446655440000" \
  -H "Content-Type: application/json" \
  -d '{"customer_number": "+1234567890"}'
```

### 2. Send Manual Reply
```bash
curl -X POST http://localhost:3000/messages/manual-reply \
  -H "x-user-id: 550e8400-e29b-41d4-a716-446655440000" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_number": "+1234567890",
    "message": "How can I help you today?"
  }'
```

### 3. Release Takeover
```bash
curl -X POST http://localhost:3000/messages/release-takeover \
  -H "x-user-id: 550e8400-e29b-41d4-a716-446655440000" \
  -H "Content-Type: application/json" \
  -d '{"customer_number": "+1234567890"}'
```

### 4. Get Conversation
```bash
curl -X GET "http://localhost:3000/messages/conversation/%2B1234567890" \
  -H "x-user-id: 550e8400-e29b-41d4-a716-446655440000"
```

### 5. Get All Messages
```bash
curl -X GET http://localhost:3000/messages
```

---

## Response Examples

### Takeover Success
```json
{
  "success": true,
  "message": "Human takeover enabled",
  "conversation_id": "550e8400-e29b-41d4-a716-446655440001",
  "takeover_started_at": "2026-05-16T10:00:00Z",
  "customer_number": "+1234567890"
}
```

### Manual Reply Success
```json
{
  "success": true,
  "message_id": "550e8400-e29b-41d4-a716-446655440002",
  "sent_at": "2026-05-16T10:05:30Z",
  "customer_number": "+1234567890",
  "message_text": "How can I help you today?"
}
```

### Release Success
```json
{
  "success": true,
  "message": "Conversation released to bot mode",
  "conversation_id": "550e8400-e29b-41d4-a716-446655440001",
  "takeover_ended_at": "2026-05-16T10:15:00Z",
  "customer_number": "+1234567890"
}
```

### Error Examples
```json
// 401 Unauthorized
{
  "error": "Unauthorized - Missing user_id",
  "status": 401
}

// 403 Forbidden
{
  "error": "Forbidden - conversation not owned by this user",
  "status": 403
}

// 404 Not Found
{
  "error": "Conversation not found",
  "status": 404
}

// 409 Conflict
{
  "error": "Conversation already in human takeover mode",
  "status": 409
}

// 400 Bad Request
{
  "error": "Message cannot be empty",
  "status": 400
}
```

---

## Environment Variables Required

Add to `.env`:
```
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
```

---

## Database Tables

### messages (updated)
- `id` - UUID
- `customer_number` - VARCHAR(20)
- `incoming_message` - TEXT
- `bot_reply` - TEXT
- **`human_takeover`** - BOOLEAN (NEW)
- **`is_manual_reply`** - BOOLEAN (NEW)
- **`agent_id`** - UUID (NEW)
- **`takeover_started_at`** - TIMESTAMP (NEW)
- **`takeover_ended_at`** - TIMESTAMP (NEW)
- `created_at` - TIMESTAMP

### conversations (new)
- `id` - UUID
- `user_id` - UUID
- `customer_number` - VARCHAR(20)
- `status` - VARCHAR(20)
- `human_takeover` - BOOLEAN
- `agent_id` - UUID
- `created_at` - TIMESTAMP
- `updated_at` - TIMESTAMP

---

## State Machine

```
bot_mode
   ↓ (agent clicks "Take Over")
human_takeover
   ↓ (agent sends messages)
human_takeover (stays in this state)
   ↓ (agent clicks "Release")
bot_mode
   ↓ (bot resumes normal operation)
```

---

## WhatsApp Messages Sent

| Event | Message | Notes |
|-------|---------|-------|
| Takeover enabled | "Our team will help you shortly" | Customer receives this message |
| Manual reply sent | Agent's message | Agent's custom text, no bot involvement |
| Takeover released | "Bot automation resumed. 🤖" | Bot auto-replies resume for new messages |

### Bot Silence Feature
- During takeover mode: **NO automatic bot responses** (like "I didn't understand")
- Messages are saved but customer only receives agent's manual replies
- Ensures clean, agent-controlled communication

---

## Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| 401 Unauthorized | Add x-user-id header with valid UUID |
| 403 Forbidden | Use correct agent user_id (not customer number) |
| 404 Not Found | Create conversation first by calling /takeover |
| 409 Conflict | Already in takeover, call /release-takeover first |
| Phone number error | Use international format: +[country][number] |
| WhatsApp not sending | Check TWILIO_* environment variables |

---

## Next Steps

1. ✅ Database: Run migrations from `migrations/add_human_takeover.sql`
2. ✅ Server: Updated all endpoints in `server.js`
3. ⏳ Frontend: Implement UI buttons for takeover/release
4. ⏳ Testing: Test all endpoints with real customer numbers
5. ⏳ Commit: `git add . && git commit -m "feat: implement human takeover mode"`
6. ⏳ Deploy: Push to production

---

**Version**: 1.0.0  
**Last Updated**: 2026-05-16  
**Status**: Ready for Implementation
