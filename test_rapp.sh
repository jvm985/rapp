#!/bin/bash
URL="https://r.irishof.cloud"
EMAIL="test@gemini.com"

echo "🔍 Starting smoke tests for $URL..."

# Auth Test
AUTH_RES=$(curl -s -X POST "$URL/api/auth/mock" -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\"}")
TOKEN=$(echo $AUTH_RES | grep -oP '(?<="token":")[^"]+')

if [ -z "$TOKEN" ]; then
  echo "❌ Auth FAILED. Response: $AUTH_RES"
  exit 1
else
  echo "✅ Auth OK"
fi

# Persistence Test Part 1: Set variable
curl -s -X POST "$URL/api/execute" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code":"x_persistence_test <- 42"}' > /dev/null

# Persistence Test Part 2: Read variable
EXEC_RES=$(curl -s -X POST "$URL/api/execute" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code":"print(x_persistence_test)"}')

if echo "$EXEC_RES" | grep -q "\[1\] 42"; then
  echo "✅ R Persistence OK"
else
  echo "❌ R Persistence FAILED. Response: $EXEC_RES"
  exit 1
fi

echo "🚀 All smoke tests passed!"
