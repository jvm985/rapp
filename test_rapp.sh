#!/bin/bash
# Smoke test for Rapp (r.irishof.cloud)

URL="https://r.irishof.cloud"
API_URL="$URL/api"

echo "🔍 Starting smoke tests for $URL..."

# 1. Check Frontend
echo -n "1. Testing Frontend: "
if curl -sL "$URL" | grep -q "Irishof R Editor"; then
    echo "✅ OK (Found 'Irishof R Editor')"
else
    echo "❌ FAILED (Could not find login page text)"
fi

# 2. Test Mock Auth
echo -n "2. Testing Mock Auth: "
AUTH_RES=$(curl -s -X POST "$API_URL/auth/mock" -H "Content-Type: application/json" -d '{"email":"test@gemini"}')
TOKEN=$(echo "$AUTH_RES" | grep -oP '"token":"\K[^"]+')

if [ -n "$TOKEN" ]; then
    echo "✅ OK (Received JWT token)"
else
    echo "❌ FAILED (No token received: $AUTH_RES)"
fi

# 3. Test R Execution
echo -n "3. Testing R Execution: "
EXEC_RES=$(curl -s -X POST "$API_URL/execute" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"code":"print(123+456)"}')

if echo "$EXEC_RES" | grep -q "579"; then
    echo "✅ OK (Math result 579 found)"
else
    echo "❌ FAILED (Execution failed or wrong output: $EXEC_RES)"
fi

# 4. Test Plot Generation
echo -n "4. Testing Plot Generation: "
PLOT_RES=$(curl -s -X POST "$API_URL/execute" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"code":"plot(rnorm(10))"}')

if echo "$PLOT_RES" | grep -q '"plot":"iVBOR'; then
    echo "✅ OK (Base64 PNG plot data found)"
else
    echo "❌ FAILED (No plot data in response)"
fi

echo "✨ Smoke tests completed."
