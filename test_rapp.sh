#!/bin/bash
URL="https://r.irishof.cloud"
API_URL="$URL/api"
echo "🔍 Starting smoke tests for $URL..."
AUTH_RES=$(curl -s -X POST "$API_URL/auth/mock" -H "Content-Type: application/json" -d '{"email":"test@gemini.com"}')
TOKEN=$(echo "$AUTH_RES" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
if [ -z "$TOKEN" ]; then echo "❌ Auth FAILED"; exit 1; fi
echo "✅ Auth OK"
EXEC_RES=$(curl -s -X POST "$API_URL/execute" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"code":"print(1+1)"}')
if echo "$EXEC_RES" | grep -q "2"; then echo "✅ R Exec OK"; else echo "❌ R Exec FAILED"; fi
