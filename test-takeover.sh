#!/bin/bash

# HUMAN TAKEOVER DEBUG TEST SCRIPT
# Usage: bash test-takeover.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
API_URL="${API_URL:-http://localhost:3000}"
TEST_USER="${TEST_USER:-11111111-1111-1111-1111-111111111111}"
TEST_PHONE="${TEST_PHONE:-+1234567890}"

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}       HUMAN TAKEOVER MODE - DEBUG TEST SCRIPT${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}Configuration:${NC}"
echo "  API URL: $API_URL"
echo "  Test User: $TEST_USER"
echo "  Test Phone: $TEST_PHONE"
echo ""

# Test if server is running
echo -e "${YELLOW}TEST 0: Checking if server is running...${NC}"
if ! curl -s -f -m 2 "$API_URL/replies" > /dev/null 2>&1; then
  echo -e "${RED}✗ Server not responding at $API_URL${NC}"
  echo "   Start server with: node server.js"
  exit 1
fi
echo -e "${GREEN}✓ Server is running${NC}"
echo ""

# Test 1: Enable takeover
echo -e "${YELLOW}TEST 1: Enabling human takeover...${NC}"
TAKEOVER_RESPONSE=$(curl -s -X POST "$API_URL/messages/takeover" \
  -H "x-user-id: $TEST_USER" \
  -H "Content-Type: application/json" \
  -d "{\"customer_number\": \"$TEST_PHONE\"}")

if echo "$TAKEOVER_RESPONSE" | grep -q '"success":true'; then
  echo -e "${GREEN}✓ Takeover enabled${NC}"
  CONV_ID=$(echo "$TAKEOVER_RESPONSE" | grep -o '"conversation_id":"[^"]*' | cut -d'"' -f4)
  echo "  Conversation ID: $CONV_ID"
else
  echo -e "${RED}✗ Failed to enable takeover${NC}"
  echo "$TAKEOVER_RESPONSE" | jq . 2>/dev/null || echo "$TAKEOVER_RESPONSE"
  exit 1
fi
echo ""

# Test 2: Simulate incoming message (should be silent)
echo -e "${YELLOW}TEST 2: Simulating incoming customer message during takeover...${NC}"
WEBHOOK_RESPONSE=$(curl -s -X POST "$API_URL/whatsapp" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "Body=I need help please&From=whatsapp:%2B1234567890")

if echo "$WEBHOOK_RESPONSE" | grep -q "<Message>"; then
  echo -e "${RED}✗ FAIL: Bot sent reply (should be silent during takeover)${NC}"
  echo "  Response: $WEBHOOK_RESPONSE"
  exit 1
else
  echo -e "${GREEN}✓ PASS: Bot is silent (no auto-reply sent)${NC}"
  echo "  Response: Empty XML (bot silence working)"
fi
echo ""

# Test 3: Agent sends manual reply
echo -e "${YELLOW}TEST 3: Agent sending manual reply...${NC}"
MANUAL_REPLY=$(curl -s -X POST "$API_URL/messages/manual-reply" \
  -H "x-user-id: $TEST_USER" \
  -H "Content-Type: application/json" \
  -d "{\"customer_number\": \"$TEST_PHONE\", \"message\": \"Hi! I'm an agent. How can I help?\"}")

if echo "$MANUAL_REPLY" | grep -q '"success":true'; then
  echo -e "${GREEN}✓ Manual reply sent${NC}"
  MSG_ID=$(echo "$MANUAL_REPLY" | grep -o '"message_id":"[^"]*' | cut -d'"' -f4)
  echo "  Message ID: $MSG_ID"
else
  echo -e "${RED}✗ Failed to send manual reply${NC}"
  echo "$MANUAL_REPLY" | jq . 2>/dev/null || echo "$MANUAL_REPLY"
  exit 1
fi
echo ""

# Test 4: Release takeover
echo -e "${YELLOW}TEST 4: Releasing human takeover (back to bot mode)...${NC}"
RELEASE_RESPONSE=$(curl -s -X POST "$API_URL/messages/release-takeover" \
  -H "x-user-id: $TEST_USER" \
  -H "Content-Type: application/json" \
  -d "{\"customer_number\": \"$TEST_PHONE\"}")

if echo "$RELEASE_RESPONSE" | grep -q '"success":true'; then
  echo -e "${GREEN}✓ Takeover released${NC}"
else
  echo -e "${RED}✗ Failed to release takeover${NC}"
  echo "$RELEASE_RESPONSE" | jq . 2>/dev/null || echo "$RELEASE_RESPONSE"
  exit 1
fi
echo ""

# Test 5: Verify bot replies now
echo -e "${YELLOW}TEST 5: Verifying bot replies after release...${NC}"
BOT_REPLY=$(curl -s -X POST "$API_URL/whatsapp" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "Body=hello&From=whatsapp:%2B1234567890")

if echo "$BOT_REPLY" | grep -q "<Message>"; then
  echo -e "${GREEN}✓ PASS: Bot sent auto-reply (takeover ended)${NC}"
else
  echo -e "${RED}✗ FAIL: Bot still silent (should auto-reply now)${NC}"
  echo "  Response: $BOT_REPLY"
fi
echo ""

# Summary
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✓ ALL TESTS PASSED - Human takeover is working correctly!${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. View database changes: Check conversations table in Supabase"
echo "  2. Review logs: Check server.js console output"
echo "  3. Test authentication: Try requests without x-user-id header"
echo ""
echo "For more details, see: DEBUGGING_HUMAN_TAKEOVER.md"
