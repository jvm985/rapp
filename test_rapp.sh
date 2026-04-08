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

# R Exec Test
EXEC_RES=$(curl -s -X POST "$URL/api/execute" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code":"print(1+1)"}')

if echo "$EXEC_RES" | grep -q "\[1\] 2"; then
  echo "✅ R Exec OK"
else
  echo "❌ R Exec FAILED. Response: $EXEC_RES"
  exit 1
fi

echo "🚀 All smoke tests passed!"
