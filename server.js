require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { MessagingResponse } = require("twilio").twiml;

const supabase = require("./supabase");
const { authMiddleware, validateRequest, errorHandler } = require("./auth");
const { Message, Conversation, validators } = require("./models");
const {
  sendWhatsAppMessage,
  sendTakeoverActivatedMessage,
  sendTakeoverReleasedMessage,
  sendManualReplyMessage
} = require("./whatsappHelper");

const app = express();
app.use(cors());

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

/**
 * WhatsApp Webhook - Receives incoming messages
 * Updated to handle human takeover mode
 */
app.post("/whatsapp", async (req, res) => {
  try {
    const originalMessage = req.body.Body;
    const customerNumber = req.body.From;

    // Step 1: Check conversation status
    const { data: conversations, error: convError } = await supabase
      .from("conversations")
      .select("*")
      .eq("customer_number", customerNumber)
      .limit(1);

    if (convError) {
      console.error("Supabase Error checking conversations:", convError);
      // Continue anyway - maybe first message
    }

    let inTakeover = false;
    let userId = null;

    if (conversations && conversations.length > 0) {
      inTakeover = conversations[0].human_takeover === true;
      userId = conversations[0].user_id;
    }

    // Step 2: CRITICAL - If in takeover mode, DO NOT send automatic response
    if (inTakeover) {
      // Save message with takeover flag
      const { error: saveError } = await supabase
        .from("messages")
        .insert([
          {
            user_id: userId,  // ← We know userId is NOT null (from conversation)
            customer_number: customerNumber,
            incoming_message: originalMessage,
            bot_reply: "[Waiting for agent response]",
            human_takeover: true,
            is_manual_reply: false
          }
        ]);

      if (saveError) {
        console.error("Error saving message during takeover:", saveError);
      }

      // ✅ CRITICAL: Send EMPTY response (bot silence)
      const twiml = new MessagingResponse();
      res.writeHead(200, { "Content-Type": "text/xml" });
      res.end(twiml.toString());
      return; // ← Important: return early to prevent bot reply
    }

    // Step 3: Normal bot mode - get auto-replies
    const { data: replies, error: repliesError } = await supabase
      .from("auto_replies")
      .select("*");

    if (repliesError) {
      console.error("Supabase Error fetching replies:", repliesError);
    }

    let reply = "Sorry, I didn't understand.";
    const incomingMessage = originalMessage.toLowerCase();

    for (const item of replies) {
      const trigger = item.trigger_word.toLowerCase();
      if (incomingMessage.includes(trigger)) {
        reply = item.reply_message;
        console.log("Matched trigger:", trigger, "Reply:", reply);
        break;
      }
    }

    // Step 4: Save message history with bot reply
    const { error: saveError } = await supabase
      .from("messages")
      .insert([
        {
          user_id: userId || "00000000-0000-0000-0000-000000000000",  // ← CRITICAL: Use fallback UUID if null
          customer_number: customerNumber,
          incoming_message: originalMessage,
          bot_reply: reply,
          human_takeover: false,
          is_manual_reply: false
        }
      ]);

    if (saveError) {
      console.error("Error saving message in bot mode:", saveError);
      // Still send reply even if save failed
    }

    // Step 5: Send bot reply to customer
    const twiml = new MessagingResponse();
    twiml.message(reply);

    res.writeHead(200, { "Content-Type": "text/xml" });
    res.end(twiml.toString());

  } catch (err) {
    console.error("Error in WhatsApp webhook:", err);
    res.sendStatus(500);
  }
});

app.get("/replies", async (req, res) => {

    try {

        //const userId = req.query.user_id;

const { data, error } = await supabase
    .from("auto_replies")
    .select("*")
    //.eq("user_id", userId);

        if (error) {
            return res.status(500).json(error);
        }

        res.json(data);

    } catch (err) {

        console.log(err);

        res.sendStatus(500);
    }
});

app.post("/replies", async (req, res) => {

    try {

        const {
            trigger_word,
            reply_message,
           // user_id
        } = req.body;

        const { data, error } = await supabase
            .from("auto_replies")
            .insert([
                {
                    trigger_word,
                    reply_message,
                   // user_id
                }
            ]);

        if (error) {
            return res.status(500).json(error);
        }

        res.json(data);

    } catch (err) {

        console.log(err);

        res.sendStatus(500);
    }
});

app.delete("/replies/:id", async (req, res) => {

    try {

        const id = req.params.id;

        const { error } = await supabase
            .from("auto_replies")
            .delete()
            .eq("id", id);

        if (error) {
            return res.status(500).json(error);
        }

        res.json({
            success: true
        });

    } catch (err) {

        console.log(err);

        res.sendStatus(500);
    }
});

app.put("/replies/:id", async (req, res) => {

    try {

        const id = req.params.id;

        const { trigger_word, reply_message } = req.body;

        const { data, error } = await supabase
            .from("auto_replies")
            .update({
                trigger_word,
                reply_message
            })
            .eq("id", id);

        if (error) {
            return res.status(500).json(error);
        }

        res.json(data);

    } catch (err) {

        console.log(err);

        res.sendStatus(500);
    }
});

app.get("/messages", async (req, res) => {

    try {

        const { data, error } = await supabase
            .from("messages")
            .select("*")
            .order("created_at", {
                ascending: false
            });

        if (error) {
            return res.status(500).json(error);
        }

        // Transform data to include all fields
        const messages = data.map(msg => new Message(msg));

        res.json(messages);

    } catch (err) {

        console.log(err);

        res.sendStatus(500);
    }
});

app.listen(3000, () => {
    console.log("Server running on port 3000");
});

/**
 * ==================== NEW HUMAN TAKEOVER ENDPOINTS ====================
 */

/**
 * POST /messages/takeover
 * Enable human takeover for a customer conversation
 * Requires: x-user-id header, customer_number in body
 */
app.post("/messages/takeover", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const { customer_number } = req.body;

    // Validate phone number
    if (!customer_number || !validators.isValidPhoneNumber(customer_number)) {
      return res.status(400).json({
        error: "Invalid customer_number format",
        status: 400
      });
    }

    // Find or create conversation
    const { data: existingConv, error: fetchError } = await supabase
      .from("conversations")
      .select("*")
      .eq("user_id", userId)
      .eq("customer_number", customer_number)
      .limit(1);

    if (fetchError) {
      console.error("Error fetching conversation:", fetchError);
      return res.status(500).json({
        error: "Database error",
        status: 500
      });
    }

    let conversation;

    if (existingConv && existingConv.length > 0) {
      // Update existing conversation
      conversation = existingConv[0];
      
      if (conversation.human_takeover === true) {
        return res.status(409).json({
          error: "Conversation already in human takeover mode",
          status: 409
        });
      }

      const { error: updateError } = await supabase
        .from("conversations")
        .update({
          human_takeover: true,
          status: "human_takeover",
          agent_id: userId,
          updated_at: new Date().toISOString()
        })
        .eq("id", conversation.id);

      if (updateError) {
        console.error("Error updating conversation:", updateError);
        return res.status(500).json({
          error: "Failed to update conversation",
          status: 500
        });
      }
    } else {
      // Create new conversation
      const { data: newConv, error: createError } = await supabase
        .from("conversations")
        .insert([
          {
            user_id: userId,
            customer_number,
            status: "human_takeover",
            human_takeover: true,
            agent_id: userId
          }
        ])
        .select();

      if (createError) {
        console.error("Error creating conversation:", createError);
        return res.status(500).json({
          error: "Failed to create conversation",
          status: 500
        });
      }

      conversation = newConv[0];
    }

    // Send WhatsApp message to customer
    const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886";
    const whatsappResult = await sendTakeoverActivatedMessage(customer_number, whatsappFrom);

    if (!whatsappResult.success) {
      console.error("Failed to send WhatsApp message:", whatsappResult.error);
      // Still return success since database update was successful
    }

    res.json({
      success: true,
      message: "Human takeover enabled",
      conversation_id: conversation.id,
      takeover_started_at: new Date().toISOString(),
      customer_number
    });

  } catch (error) {
    console.error("Error in takeover endpoint:", error);
    res.status(500).json({
      error: error.message,
      status: 500
    });
  }
});

/**
 * POST /messages/release-takeover
 * Release conversation back to bot mode
 * Requires: x-user-id header, customer_number in body
 */
app.post("/messages/release-takeover", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const { customer_number } = req.body;

    // Validate phone number
    if (!customer_number || !validators.isValidPhoneNumber(customer_number)) {
      return res.status(400).json({
        error: "Invalid customer_number format",
        status: 400
      });
    }

    // Find conversation
    const { data: conversations, error: fetchError } = await supabase
      .from("conversations")
      .select("*")
      .eq("user_id", userId)
      .eq("customer_number", customer_number)
      .limit(1);

    if (fetchError) {
      console.error("Error fetching conversation:", fetchError);
      return res.status(500).json({
        error: "Database error",
        status: 500
      });
    }

    if (!conversations || conversations.length === 0) {
      return res.status(404).json({
        error: "Conversation not found",
        status: 404
      });
    }

    const conversation = conversations[0];

    // Check if user owns this conversation
    if (conversation.user_id !== userId) {
      return res.status(403).json({
        error: "Forbidden - conversation not owned by this user",
        status: 403
      });
    }

    // Update conversation
    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("conversations")
      .update({
        human_takeover: false,
        status: "bot_mode",
        updated_at: now
      })
      .eq("id", conversation.id);

    if (updateError) {
      console.error("Error updating conversation:", updateError);
      return res.status(500).json({
        error: "Failed to update conversation",
        status: 500
      });
    }

    // Save release event in messages table
    await supabase
      .from("messages")
      .insert([
        {
          customer_number,
          incoming_message: "[System]",
          bot_reply: "[Human takeover ended - Bot mode resumed]",
          human_takeover: false,
          is_manual_reply: false,
          takeover_ended_at: now
        }
      ]);

    // Send WhatsApp message to customer
    const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886";
    const whatsappResult = await sendTakeoverReleasedMessage(customer_number, whatsappFrom);

    if (!whatsappResult.success) {
      console.error("Failed to send WhatsApp message:", whatsappResult.error);
      // Still return success since database update was successful
    }

    res.json({
      success: true,
      message: "Conversation released to bot mode",
      conversation_id: conversation.id,
      takeover_ended_at: now,
      customer_number
    });

  } catch (error) {
    console.error("Error in release-takeover endpoint:", error);
    res.status(500).json({
      error: error.message,
      status: 500
    });
  }
});

/**
 * POST /messages/manual-reply
 * Agent sends a manual message to customer during takeover
 * Requires: x-user-id header, customer_number and message in body
 */
app.post("/messages/manual-reply", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const { customer_number, message } = req.body;

    // Validate inputs
    const validation = validators.validateManualReplyRequest(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        error: validation.errors.join(", "),
        status: 400
      });
    }

    // Find conversation
    const { data: conversations, error: fetchError } = await supabase
      .from("conversations")
      .select("*")
      .eq("user_id", userId)
      .eq("customer_number", customer_number)
      .limit(1);

    if (fetchError) {
      console.error("Error fetching conversation:", fetchError);
      return res.status(500).json({
        error: "Database error",
        status: 500
      });
    }

    if (!conversations || conversations.length === 0) {
      return res.status(404).json({
        error: "Conversation not found",
        status: 404
      });
    }

    const conversation = conversations[0];

    // Check if user owns this conversation
    if (conversation.user_id !== userId) {
      return res.status(403).json({
        error: "Forbidden - conversation not owned by this user",
        status: 403
      });
    }

    // Check if in takeover mode
    if (conversation.human_takeover !== true) {
      return res.status(400).json({
        error: "Cannot send manual reply - not in human takeover mode",
        status: 400
      });
    }

    // Save manual reply to database
    const now = new Date().toISOString();
    const { data: savedMessage, error: saveError } = await supabase
      .from("messages")
      .insert([
        {
          customer_number,
          incoming_message: "[Agent]",
          bot_reply: message,
          human_takeover: true,
          is_manual_reply: true,
          agent_id: userId
        }
      ])
      .select();

    if (saveError) {
      console.error("Error saving message:", saveError);
      return res.status(500).json({
        error: "Failed to save message",
        status: 500
      });
    }

    // Send message via WhatsApp
    const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886";
    const whatsappResult = await sendManualReplyMessage(customer_number, message, whatsappFrom);

    if (!whatsappResult.success) {
      console.error("Failed to send WhatsApp message:", whatsappResult.error);
      return res.status(500).json({
        error: "Failed to send message via WhatsApp",
        status: 500
      });
    }

    res.json({
      success: true,
      message_id: savedMessage[0].id,
      sent_at: now,
      customer_number,
      message_text: message
    });

  } catch (error) {
    console.error("Error in manual-reply endpoint:", error);
    res.status(500).json({
      error: error.message,
      status: 500
    });
  }
});

/**
 * GET /messages/conversation/:customer_number
 * Get all messages for a specific conversation
 * Requires: x-user-id header
 */
app.get("/messages/conversation/:customer_number", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const { customer_number } = req.params;

    // Validate phone number
    if (!validators.isValidPhoneNumber(customer_number)) {
      return res.status(400).json({
        error: "Invalid customer_number format",
        status: 400
      });
    }

    // First check conversation ownership
    const { data: conversations, error: convError } = await supabase
      .from("conversations")
      .select("*")
      .eq("user_id", userId)
      .eq("customer_number", customer_number)
      .limit(1);

    if (convError) {
      console.error("Error fetching conversation:", convError);
      return res.status(500).json({
        error: "Database error",
        status: 500
      });
    }

    if (!conversations || conversations.length === 0) {
      return res.status(404).json({
        error: "Conversation not found or not owned by user",
        status: 404
      });
    }

    // Get all messages for this customer
    const { data: messages, error: msgError } = await supabase
      .from("messages")
      .select("*")
      .eq("customer_number", customer_number)
      .order("created_at", { ascending: true });

    if (msgError) {
      console.error("Error fetching messages:", msgError);
      return res.status(500).json({
        error: "Failed to fetch messages",
        status: 500
      });
    }

    const conversation = conversations[0];
    const messageList = messages.map(msg => new Message(msg));

    res.json({
      conversation: new Conversation(conversation),
      messages: messageList,
      total_count: messageList.length
    });

  } catch (error) {
    console.error("Error in conversation endpoint:", error);
    res.status(500).json({
      error: error.message,
      status: 500
    });
  }
});