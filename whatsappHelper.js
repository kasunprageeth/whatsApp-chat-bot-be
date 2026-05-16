const { MessagingResponse } = require("twilio").twiml;
const twilio = require("twilio");

// Initialize Twilio client
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

/**
 * Send a WhatsApp message using Twilio
 * @param {string} toNumber - Customer phone number (e.g., +1234567890)
 * @param {string} message - Message text
 * @param {string} fromNumber - Twilio WhatsApp number
 * @returns {Promise<Object>} - Message SID and response
 */
async function sendWhatsAppMessage(toNumber, message, fromNumber) {
  try {
    const response = await client.messages.create({
      body: message,
      from: `whatsapp:${fromNumber}`,
      to: `whatsapp:${toNumber}`
    });
    
    return {
      success: true,
      messageSid: response.sid,
      status: response.status
    };
  } catch (error) {
    console.error("Error sending WhatsApp message:", error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Send takeover activation message to customer
 */
async function sendTakeoverActivatedMessage(customerNumber, fromNumber) {
  return sendWhatsAppMessage(
    customerNumber,
    "Our agent will reply soon. 🤝",
    fromNumber
  );
}

/**
 * Send takeover release message to customer
 */
async function sendTakeoverReleasedMessage(customerNumber, fromNumber) {
  return sendWhatsAppMessage(
    customerNumber,
    "Bot automation resumed. 🤖",
    fromNumber
  );
}

/**
 * Send manual reply message from agent
 */
async function sendManualReplyMessage(customerNumber, message, fromNumber) {
  return sendWhatsAppMessage(customerNumber, message, fromNumber);
}

module.exports = {
  sendWhatsAppMessage,
  sendTakeoverActivatedMessage,
  sendTakeoverReleasedMessage,
  sendManualReplyMessage
};
