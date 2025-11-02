#!/bin/bash

# Fix unused _request parameters
sed -i '' 's/export async function GET(_request: NextRequest)/export async function GET()/g' src/app/api/user/profile/route.ts
sed -i '' 's/function validateWebhookSignature(_request: NextRequest)/function validateWebhookSignature()/g' src/app/api/webhooks/subscription/route.ts

# Fix unused variables in billing.ts
sed -i '' 's/params//* _params *//g' src/lib/billing.ts

# Fix unused variables in profile page
sed -i '' 's/, _keyId/, keyId/g' src/app/profile/page.tsx

# Fix unused variables in test file
sed -i '' 's/const notifications =/\/\/ const notifications =/g' src/lib/notification-autodismiss.test.ts

echo "✅ Basic fixes applied"
