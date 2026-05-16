/**
 * Message Model
 */
class Message {
  constructor(data) {
    this.id = data.id;
    this.customer_number = data.customer_number;
    this.incoming_message = data.incoming_message;
    this.bot_reply = data.bot_reply;
    this.human_takeover = data.human_takeover || false;
    this.is_manual_reply = data.is_manual_reply || false;
    this.agent_id = data.agent_id || null;
    this.takeover_started_at = data.takeover_started_at || null;
    this.takeover_ended_at = data.takeover_ended_at || null;
    this.created_at = data.created_at;
  }

  toJSON() {
    return {
      id: this.id,
      customer_number: this.customer_number,
      incoming_message: this.incoming_message,
      bot_reply: this.bot_reply,
      human_takeover: this.human_takeover,
      is_manual_reply: this.is_manual_reply,
      agent_id: this.agent_id,
      takeover_started_at: this.takeover_started_at,
      takeover_ended_at: this.takeover_ended_at,
      created_at: this.created_at
    };
  }
}

/**
 * Conversation Model
 */
class Conversation {
  constructor(data) {
    this.id = data.id;
    this.user_id = data.user_id;
    this.customer_number = data.customer_number;
    this.status = data.status || 'bot_mode';
    this.human_takeover = data.human_takeover || false;
    this.agent_id = data.agent_id || null;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }

  toJSON() {
    return {
      id: this.id,
      user_id: this.user_id,
      customer_number: this.customer_number,
      status: this.status,
      human_takeover: this.human_takeover,
      agent_id: this.agent_id,
      created_at: this.created_at,
      updated_at: this.updated_at
    };
  }
}

/**
 * Validation Functions
 */
const validators = {
  isValidPhoneNumber: (phone) => {
    return typeof phone === 'string' && /^\+?[1-9]\d{1,14}$/.test(phone.replace(/\s/g, ''));
  },

  isValidUUID: (uuid) => {
    return typeof uuid === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);
  },

  isValidMessage: (message) => {
    return typeof message === 'string' && message.trim().length > 0 && message.trim().length <= 1024;
  },

  validateManualReplyRequest: (body) => {
    const errors = [];
    
    if (!body.customer_number || !validators.isValidPhoneNumber(body.customer_number)) {
      errors.push("Invalid customer_number");
    }
    
    if (!body.message || !validators.isValidMessage(body.message)) {
      errors.push("Message must be a non-empty string (max 1024 characters)");
    }
    
    return errors.length === 0 ? { valid: true } : { valid: false, errors };
  },

  validateTakeoverRequest: (body) => {
    const errors = [];
    
    if (!body.customer_number || !validators.isValidPhoneNumber(body.customer_number)) {
      errors.push("Invalid customer_number");
    }
    
    return errors.length === 0 ? { valid: true } : { valid: false, errors };
  }
};

module.exports = {
  Message,
  Conversation,
  validators
};
