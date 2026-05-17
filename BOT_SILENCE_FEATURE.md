# Bot Silence Feature - Implementation Details

## Overview

When an agent takes over a conversation (human_takeover=true), the bot enters **"silence mode"**. This means:
- ❌ NO automatic bot responses are sent
- ✅ Messages are saved for agent review
- ✅ Only agent's manual replies are transmitted to the customer
- ✅ Professional, clean conversation thread

---

## How It Works

### Incoming Message Flow

```
Customer sends WhatsApp message
         ↓
Twilio forwards to POST /whatsapp
         ↓
Extract customer_number & message
         ↓
┌─────────────────────────────────────────┐
│ Query conversations table:              │
│ WHERE customer_number = X               │
│ LIMIT 1                                 │
└─────────────────────────────────────────┘
         ↓
    ┌────┴────┐
    │          │
   YES        NO
    │          │
    ↓          ↓
TAKEOVER?  NORMAL BOT MODE
    │          │
    ↓          ↓
┌─────────┐  ┌─────────────────────┐
│BOT      │  │Query auto_replies   │
│SILENCE  │  │Match trigger words  │
│         │  │Generate response    │
│• Save   │  └─────────────────────┘
│  msg    │           ↓
│• NO     │  ┌─────────────────────┐
│  auto-  │  │Send auto-reply to   │
│  reply  │  │customer via WhatsApp│
│• Return │  └─────────────────────┘
│  empty  │
│  XML    │
└─────────┘
```

---

## Code Implementation

### Step 1: Check Takeover Status

```javascript
// Query conversations table for this customer
const { data: conversations } = await supabase
  .from("conversations")
  .select("*")
  .eq("customer_number", customerNumber)
  .limit(1);

// Extract user_id and takeover status
let inTakeover = false;
let userId = null;

if (conversations && conversations.length > 0) {
  inTakeover = conversations[0].human_takeover === true;  // ← Check flag
  userId = conversations[0].user_id;                       // ← Get tenant ID
}
```

### Step 2: Handle Takeover Mode (Bot Silence)

```javascript
if (inTakeover) {
  // ✅ Save message for agent review
  await supabase
    .from("messages")
    .insert([
      {
        user_id: userId,                    // Multi-tenant support
        customer_number: customerNumber,
        incoming_message: originalMessage,
        bot_reply: "[Waiting for agent response]",  // Marker for agent
        human_takeover: true,               // Flag this as takeover message
        is_manual_reply: false
      }
    ]);

  // ❌ Send empty response (bot silence - NO automatic message)
  const twiml = new MessagingResponse();
  res.writeHead(200, { "Content-Type": "text/xml" });
  res.end(twiml.toString());
  
  return;  // ← Exit early, skip bot auto-reply logic
}
```

### Step 3: Handle Normal Bot Mode

```javascript
// Only reached if NOT in takeover mode
const { data: replies } = await supabase
  .from("auto_replies")
  .select("*");

// Match trigger words
let reply = "Sorry, I didn't understand.";
for (const item of replies) {
  const trigger = item.trigger_word.toLowerCase();
  if (incomingMessage.includes(trigger)) {
    reply = item.reply_message;
    break;
  }
}

// ✅ Save message
await supabase
  .from("messages")
  .insert([
    {
      user_id: userId,                  // Multi-tenant
      customer_number: customerNumber,
      incoming_message: originalMessage,
      bot_reply: reply,
      human_takeover: false,
      is_manual_reply: false
    }
  ]);

// ✅ Send auto-reply to customer
const twiml = new MessagingResponse();
twiml.message(reply);
res.writeHead(200, { "Content-Type": "text/xml" });
res.end(twiml.toString());
```

---

## Message Storage Behavior

### During Bot Mode
```
Customer: "What's your price?"
        ↓
Bot checks auto_replies table
        ↓
Finds match: "price" → "Check our website"
        ↓
Saves:
{
  customer_number: "+1234567890",
  incoming_message: "What's your price?",
  bot_reply: "Check our website",
  human_takeover: false,
  is_manual_reply: false
}
        ↓
Customer receives: "Check our website"
```

### During Takeover Mode
```
Customer: "I need urgent help"
        ↓
Bot checks takeover status
        ↓
Found: human_takeover = true
        ↓
Saves:
{
  user_id: "agent-uuid",
  customer_number: "+1234567890",
  incoming_message: "I need urgent help",
  bot_reply: "[Waiting for agent response]",
  human_takeover: true,
  is_manual_reply: false
}
        ↓
Customer receives: [NOTHING - bot silence]
        ↓
Agent sees message in dashboard
        ↓
Agent sends manual reply
        ↓
Customer receives: [Agent's message only]
```

---

## Message Flags Explained

### human_takeover
- `true` = In takeover mode (bot silent, agent responds)
- `false` = In bot mode (auto-replies active)

### is_manual_reply
- `true` = Agent typed this message manually
- `false` = Bot generated this message OR waiting for agent

### bot_reply
- During takeover: `"[Waiting for agent response]"` (marker)
- During agent reply: Agent's actual message text
- During bot mode: Bot's auto-reply text

### Example Message Timeline
```
Message 1: Customer asks "What do you offer?"
{
  incoming_message: "What do you offer?",
  bot_reply: "Visit our website for details",
  human_takeover: false,
  is_manual_reply: false
}

Message 2: Agent enables takeover
(conversation.human_takeover = true)

Message 3: Customer messages "I'm angry"
{
  incoming_message: "I'm angry",
  bot_reply: "[Waiting for agent response]",
  human_takeover: true,
  is_manual_reply: false
}

Message 4: Agent sends manual reply
{
  incoming_message: "[Agent]",
  bot_reply: "I apologize. Let's resolve this together.",
  human_takeover: true,
  is_manual_reply: true,
  agent_id: "agent-uuid"
}

Message 5: Agent releases takeover
(conversation.human_takeover = false)

Message 6: Customer messages "What's your return policy?"
{
  incoming_message: "What's your return policy?",
  bot_reply: "We offer 30-day returns. Visit our FAQ.",
  human_takeover: false,
  is_manual_reply: false
}
```

---

## Multi-Tenant Flow

With the updated webhook, multi-tenant isolation is maintained:

```
Customer sends message to Twilio
         ↓
Webhook queries conversations table
         ↓
Find conversation by customer_number
         ↓
Get user_id from conversation record
         ↓
Save message with user_id = conversation.user_id
         ↓
Result: Message is automatically tagged with correct tenant
         ↓
Only that tenant's agent can see it
         ↓
RLS policies enforce isolation at DB level
```

---

## Security & Guarantees

✅ **Message Privacy**
- Each message includes user_id (tenant ID)
- RLS policies prevent cross-tenant access
- Only message owner's agent can see it

✅ **Bot Silence Guarantee**
- If human_takeover=true, NO automatic response is sent
- Message is saved but empty XML response returned
- Customer never sees bot messages during takeover

✅ **Multi-Tenant Isolation**
- Webhook now captures user_id from conversation
- All messages tagged with correct tenant
- No accidental data leakage between tenants

---

## Testing Bot Silence

### Test 1: Normal Bot Mode
```bash
# No conversation exists
curl -X POST http://localhost:3000/whatsapp \
  -d "Body=Hello&From=whatsapp:%2B1234567890"

# Result:
# ✅ Bot matches auto-reply
# ✅ Message sent: "I didn't understand" or matched reply
# ✅ Message saved with human_takeover=false
```

### Test 2: Takeover Mode
```bash
# First, enable takeover
curl -X POST http://localhost:3000/api/messages/takeover \
  -H "Authorization: Bearer JWT" \
  -d '{"customer_number": "+1234567890"}'

# Now send message
curl -X POST http://localhost:3000/whatsapp \
  -d "Body=Help!&From=whatsapp:%2B1234567890"

# Result:
# ✅ Message saved with human_takeover=true
# ❌ NO automatic bot reply sent (bot silence)
# ✅ Customer sees nothing
# ✅ Agent sees message in dashboard
```

### Test 3: Verify Message Storage
```bash
# Query messages for this customer
curl -H "Authorization: Bearer JWT" \
  http://localhost:3000/api/messages/conversation/%2B1234567890

# Result shows:
# • Message during bot mode: human_takeover=false, bot_reply="[auto-reply]"
# • Message during takeover: human_takeover=true, bot_reply="[Waiting for agent response]"
```

---

## Troubleshooting

### Problem: Bot still sends auto-reply during takeover
**Cause**: Conversation not found or human_takeover=false  
**Solution**:
1. Verify conversation exists: `SELECT * FROM conversations WHERE customer_number = X`
2. Verify takeover enabled: `human_takeover = true`
3. Check webhook logs for query errors

### Problem: Messages not being saved
**Cause**: user_id is NULL (multi-tenant issue)  
**Solution**:
1. Ensure conversation has user_id set
2. Verify conversation exists before customer message arrives
3. Check database user_id column exists

### Problem: Agent never sees customer messages
**Cause**: Messages not associated with correct tenant  
**Solution**:
1. Messages must have user_id matching conversation.user_id
2. Verify RLS policies not blocking access
3. Check agent token has access to that user_id

---

## Summary

**Bot Silence During Takeover:**
- ✅ Messages are received and stored
- ✅ No automatic bot response is sent
- ✅ Only agent's manual replies are transmitted
- ✅ Clean, professional conversation thread
- ✅ Multi-tenant isolation maintained

**Implementation: Simple & Effective**
- One flag check: `if (human_takeover) { ... bot silence ... } else { ... auto-reply ... }`
- Message saved in both cases
- User_id captured for multi-tenant support
- Database RLS provides additional safety layer

---

**Version**: 1.0.0  
**Last Updated**: 2026-05-17  
**Status**: ✅ Implemented and Tested
