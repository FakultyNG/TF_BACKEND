# TF Backend

NestJS backend for TRANSFA mobile and admin APIs from `API_CONTRACT.md`.

## Stack

- Node.js
- NestJS
- PostgreSQL
- Prisma
- Redis
- JWT access and refresh tokens
- Swagger/OpenAPI

## Implemented Mobile Features

1. Send OTP
2. Resend OTP
3. Validate OTP
4. Start registration
5. Complete registration / create passcode
6. Verify BVN
7. Validate BVN with selfie
8. Get KYC status
9. Login
10. Refresh token
11. Logout
12. Change passcode
13. Request passcode reset OTP
14. Verify passcode reset OTP
15. Complete passcode reset
16. Create/get dedicated virtual account
17. Get wallet balance and summary
18. Verify wallet funding
19. NGN banks, account resolve, quote, and transfer confirm
20. USD supplier payout quote and confirm
21. CNY supplier payout quote and confirm
22. Gift card list, quote, create, and details
23. Support ticket create/list/details/reply/close
24. Transaction history and transaction details
25. Profile get/update
26. Biometric status, enable, disable, and login
27. Notifications list/read-all/read-one plus metadata lists
28. CashDrop profile registration, status, disable, and image resolve
29. Provider webhook infrastructure for funding, DVA, transfer, KYC, payout, and gift card status events
30. Recent transfer beneficiaries for NGN, USD, and CNY transfers
31. Support ticket file attachments
32. Cloudinary-backed uploads for profile images, KYC selfies, support attachments, and notification images
33. Firebase Cloud Messaging device token registration and push delivery

## Admin Scope

Admin APIs are separated under `/api/v1/admin`, use a separate admin JWT secret, enforce role guards, and write sensitive actions to `AuditLog`.

Included admin endpoints:

- `POST /api/v1/admin/auth/login`
- `GET /api/v1/admin/users`
- `GET /api/v1/admin/users/:id`
- `GET /api/v1/admin/kyc-records`
- `PATCH /api/v1/admin/kyc-records/:id/status`
- `GET /api/v1/admin/auth-sessions`
- `GET /api/v1/admin/audit-logs`
- `GET /api/v1/admin/dva`
- `GET /api/v1/admin/dva/:dvaId`
- `POST /api/v1/admin/users/:userId/dva/recreate`
- `GET /api/v1/admin/users/:userId/wallet`
- `GET /api/v1/admin/users/:userId/wallet/ledger`
- `POST /api/v1/admin/users/:userId/wallet/adjust`
- `GET /api/v1/admin/transactions`
- `GET /api/v1/admin/transactions/:transactionId`
- `POST /api/v1/admin/transactions/:transactionId/retry`
- `POST /api/v1/admin/transactions/:transactionId/reverse`
- `GET /api/v1/admin/transfers/ngn`
- `GET /api/v1/admin/transfers/usd`
- `GET /api/v1/admin/transfers/cny`
- `GET /api/v1/admin/fees`
- `GET /api/v1/admin/fees/:key`
- `PATCH /api/v1/admin/fees/:key`
- `GET /api/v1/admin/gift-cards/purchases`
- `PATCH /api/v1/admin/gift-cards/products/:giftCardId/status`
- `GET /api/v1/admin/support/tickets`
- `GET /api/v1/admin/support/tickets/:ticketId`
- `POST /api/v1/admin/support/tickets/:ticketId/reply`
- `POST /api/v1/admin/support/tickets/:ticketId/assign`
- `POST /api/v1/admin/support/tickets/:ticketId/close`
- `POST /api/v1/admin/support/tickets/:ticketId/reopen`
- `GET /api/v1/admin/users/:userId/profile`
- `PATCH /api/v1/admin/users/:userId/profile/operational`
- `GET /api/v1/admin/users/:userId/trusted-devices`
- `POST /api/v1/admin/users/:userId/trusted-devices/:deviceId/revoke`
- `POST /api/v1/admin/notifications`
- `GET /api/v1/admin/notifications`
- `GET /api/v1/admin/notifications/:notificationId`
- `PATCH /api/v1/admin/notifications/:notificationId`
- `POST /api/v1/admin/notifications/:notificationId/send`
- `POST /api/v1/admin/notifications/:notificationId/disable`
- `DELETE /api/v1/admin/notifications/:notificationId`
- `GET /api/v1/admin/cash-drop/profiles`
- `GET /api/v1/admin/cash-drop/profiles/:cashDropId`
- `POST /api/v1/admin/cash-drop/profiles/:cashDropId/disable`
- `POST /api/v1/admin/cash-drop/profiles/:cashDropId/enable`
- `GET /api/v1/admin/webhooks/logs`
- `GET /api/v1/admin/webhooks/logs/:webhookLogId`
- `POST /api/v1/admin/webhooks/logs/:webhookLogId/retry`
- `GET /api/v1/admin/webhooks/summary`
- `POST /api/v1/admin/support/tickets/attachments/upload`
- `POST /api/v1/uploads/notification-image`

Admin notification create/send endpoints now create the database notification first, then attempt Firebase push delivery for active user device tokens when the notification is published.

## Local Setup

```bash
cp .env.example .env
docker compose up -d
npm install
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run start:dev
```

The Docker Compose PostgreSQL service is exposed on local port `5433` to avoid conflicts with any PostgreSQL already installed on Windows.

API base URL:

```text
http://localhost:4000/api/v1
```

Swagger docs:

```text
http://localhost:4000/api/v1/docs
```

Swagger exposure is controlled by environment variables:

```env
SWAGGER_ENABLED=true
SWAGGER_BASIC_AUTH_ENABLED=false
SWAGGER_USERNAME=
SWAGGER_PASSWORD=
ROOT_ROUTE_HINTS_ENABLED=true
```

For Render staging, use `SWAGGER_ENABLED=true`, `SWAGGER_BASIC_AUTH_ENABLED=true`, set a strong username/password, and set `ROOT_ROUTE_HINTS_ENABLED=false` if `NODE_ENV` is still `development`. For production, use `SWAGGER_ENABLED=false` and `ROOT_ROUTE_HINTS_ENABLED=false`. The public health endpoint remains available for platform checks, but it only returns `status: ok`.

## Development Notes

- `MOCK_OTP_CODE` defaults to `123456` for local development.
- Mock provider adapters are used for DVA, funding verification, NGN transfers, USD/CNY payout quotes, and gift cards.
- OTP sessions are stored in Redis under `otp:{otpReference}`.
- Registration sessions are stored in Redis under `registration:{registrationToken}`.
- Passcode reset sessions are stored in Redis under `passcode-reset:{resetToken}`.
- Login attempt limits are stored in Redis under `login-attempts:{phoneNumber}`.
- Transfer and gift card quotes are stored in Redis under `quote:{quoteId}` and expire after 10 minutes.
- Fee configs are stored in PostgreSQL `FeeConfig`, cached in Redis under `fee-config:{key}`, and seeded from `.env`.
- Wallet funding is idempotent by provider funding reference.
- Recent beneficiaries are saved automatically after transfer submission and are scoped to the authenticated user.
- Support attachments are uploaded through the backend. Cloudinary credentials stay server-side only.
- Cloudinary is the official file storage adapter. Local development without credentials returns mock secure URLs and does not store files on disk.
- Firebase Cloud Messaging is push delivery only. TF database notifications remain the source of truth.
- Local `.env` can keep `FCM_ENABLED=false` to avoid real Firebase sends while developing. Set it to `true` with Firebase credentials to send live pushes.
- KYC provider is selected server-side with `KYC_PROVIDER`. Use `mock` locally or `prembly` with real Prembly credentials on staging/production.
- Refresh tokens are stored only as bcrypt hashes in PostgreSQL.
- Passcodes are stored only as bcrypt hashes in PostgreSQL.
- BVN is stored as a SHA-256 hash, not plain text.

## Postman / Swagger Testing Flow

1. Start dependencies and API:

```bash
docker compose up -d
npm run prisma:deploy
npm run prisma:seed
npm run start:dev
```

2. In Swagger, complete auth first:

```text
POST /api/v1/otp/send
POST /api/v1/otp/validate
POST /api/v1/auth/register/start
POST /api/v1/auth/register/kyc/bvn/verify
POST /api/v1/auth/register/kyc/selfie-validate
POST /api/v1/auth/register/complete
```

Use `MOCK_OTP_CODE=123456`. The mock KYC provider accepts any 11-digit BVN. Registration completion now requires the pre-registration BVN and selfie endpoints to pass for the same `registrationToken`.

For Prembly KYC, set:

```env
KYC_PROVIDER=prembly
PREMBLY_BASE_URL=https://api.prembly.com
PREMBLY_API_KEY=<from Prembly dashboard>
PREMBLY_APP_ID=<from Prembly dashboard>
PREMBLY_WEBHOOK_SECRET=<your configured webhook secret>
KYC_FACE_MATCH_THRESHOLD=95
```

The mobile endpoints do not change. TF backend calls Prembly BVN Advance and BVN + Face Validation, stores only hashed/masked BVN/NIN values in PostgreSQL, keeps the raw BVN only in Redis for the temporary KYC/session TTL needed between BVN and selfie validation, and stores sanitized provider responses in `ProviderLog`.

3. Click `Authorize` in Swagger and paste only the access token value, without `Bearer`.

4. Create a DVA, then fund the wallet with a mock reference:

```bash
curl -X POST http://localhost:4000/api/v1/wallet/dva/create \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"preferredBank":"auto"}'

curl -X POST http://localhost:4000/api/v1/funding/verify \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"reference":"mock_fund_001"}'
```

The mock funding provider credits `50000 NGN` once per unique reference.

5. Quote then confirm transfers or gift cards. Confirm endpoints require the user passcode and the returned `quoteId`.

6. Support ticket example:

```bash
curl -X POST http://localhost:4000/api/v1/support/tickets/attachments/upload \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -F "file=@C:/Users/USER/Pictures/receipt.png"

curl -X POST http://localhost:4000/api/v1/support/tickets \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"subject":"Recipient has not received payment","message":"The transfer is still pending after 24 hours.","attachmentUrls":["<ATTACHMENT_URL_FROM_UPLOAD>"]}'
```

Support attachments accept `jpg`, `jpeg`, `png`, `webp`, and `pdf` files up to 5MB. Without Cloudinary credentials in local development, the upload endpoint returns a mock Cloudinary-style URL and still stores attachment metadata.

Cloudinary upload endpoints:

```bash
curl -X POST http://localhost:4000/api/v1/uploads/profile-image \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -F "file=@C:/Users/USER/Pictures/profile.jpg"

curl -X POST http://localhost:4000/api/v1/uploads/kyc-selfie \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -F "file=@C:/Users/USER/Pictures/selfie.jpg"

curl -X POST http://localhost:4000/api/v1/uploads/support-attachment \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -F "file=@C:/Users/USER/Pictures/receipt.png"

curl -X POST http://localhost:4000/api/v1/uploads/notification-image \
  -H "Authorization: Bearer <ADMIN_ACCESS_TOKEN>" \
  -F "file=@C:/Users/USER/Pictures/banner.png"
```

The `/uploads/*` image endpoints accept `jpg`, `jpeg`, `png`, and `webp` files up to 2MB. KYC selfie validation still sends the selfie image data to the backend provider adapter; the backend now also uploads that selfie to Cloudinary and saves the secure URL as `profileImageUrl` after successful verification.

Base64 image JSON endpoints, including KYC selfie validation and CashDrop resolve, use `JSON_BODY_LIMIT` from `.env` because base64 payloads are much larger than normal JSON. The default local value is `10mb`; if a request exceeds it, the API returns `REQUEST_BODY_TOO_LARGE`.

Recent beneficiary examples:

```bash
curl http://localhost:4000/api/v1/transfers/recent-beneficiaries?type=ngn_transfer \
  -H "Authorization: Bearer <ACCESS_TOKEN>"

curl "http://localhost:4000/api/v1/transfers/recent-beneficiaries/search?q=1234&type=ngn_transfer" \
  -H "Authorization: Bearer <ACCESS_TOKEN>"

curl -X DELETE http://localhost:4000/api/v1/transfers/recent-beneficiaries/<BENEFICIARY_ID> \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

7. Biometric login flow:

```bash
curl -X POST http://localhost:4000/api/v1/auth/biometric/enable \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"method":"face_id","deviceId":"device_12345"}'

curl -X POST http://localhost:4000/api/v1/auth/biometric/login \
  -H "Content-Type: application/json" \
  -d '{"deviceId":"device_12345"}'
```

Biometric authentication is local to the phone. The backend stores only trusted device status, never fingerprint or face data.

8. Notification admin example:

```bash
curl -X POST http://localhost:4000/api/v1/admin/notifications \
  -H "Authorization: Bearer <ADMIN_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"title":"Software Update","message":"Transfa 1.5 introduces vendor lists.","notificationCategory":"update","type":"app_update","priority":"normal","audience":"all_users","status":"published"}'
```

Register an FCM device token after mobile login:

```bash
curl -X POST http://localhost:4000/api/v1/notifications/device-token/register \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"deviceId":"device_12345","fcmToken":"firebase_device_token","platform":"android"}'

curl -X POST http://localhost:4000/api/v1/notifications/device-token/remove \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"deviceId":"device_12345"}'
```

9. CashDrop flow:

```bash
curl -X POST http://localhost:4000/api/v1/cash-drop/register \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"useCurrentProfileImage":true}'

curl -X POST http://localhost:4000/api/v1/cash-drop/resolve \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"scannedImageBase64":"data:image/jpeg;base64,<CAPTURED_IMAGE>"}'
```

CashDrop uses server-side image fingerprinting, not face recognition. The backend stores only image fingerprints and never returns hashes to the frontend.

## Provider Webhooks

Webhook endpoints are provider-facing only. The Flutter app should never call them, and they are intentionally excluded from Swagger's frontend API list.

```text
POST /api/v1/webhooks/lync
POST /api/v1/webhooks/dojah
POST /api/v1/webhooks/prembly
POST /api/v1/webhooks/payout-provider
POST /api/v1/webhooks/reeplay
```

Each provider webhook must include an HMAC-SHA256 signature of the exact JSON request body in one of the supported signature headers, such as `x-signature`, `x-lync-signature`, `x-dojah-signature`, `x-payout-signature`, or `x-reeplay-signature`.

Local signed Lync example:

```bash
node -e "const crypto=require('crypto'); const body=JSON.stringify({event:'wallet_funding.successful',status:'successful',providerReference:'fund_ref_001',accountNumber:'1234567890',amount:50000,currency:'NGN'}); console.log(body); console.log(crypto.createHmac('sha256', process.env.LYNC_WEBHOOK_SECRET || 'local_lync_webhook_secret').update(body).digest('hex'))"
```

Then send the printed body with the printed signature:

```bash
curl -X POST http://localhost:4000/api/v1/webhooks/lync \
  -H "Content-Type: application/json" \
  -H "x-signature: <PRINTED_SIGNATURE>" \
  -d '<PRINTED_BODY>'
```

Webhook processing stores `WebhookLog` and `WebhookEvent` rows, uses `IdempotencyKey` records to reject duplicates, masks sensitive payload fields, and creates wallet ledger entries/reversal transactions for any wallet-impacting event. Admins can review logs and retry failed processing through `/api/v1/admin/webhooks/*`.

Webhook services create TF notification rows for important status changes and then attempt Firebase push delivery through `NotificationsService`. Provider webhook controllers do not call Firebase directly.

## Lync Provider Setup

Transfa mobile/admin APIs stay unchanged. Lync is used only behind the provider layer for DVA creation, funding verification, NGN account validation/transfers, FX quotes, and USD/CNY payouts.

Development mode should keep:

```env
LYNC_ENABLED=false
```

With `LYNC_ENABLED=false`, the backend uses `MockLyncProvider`, returns stable predictable responses, and stores provider metadata as `mock_lync`.

Live/sandbox mode requires Lync dashboard/API credentials and exact endpoint paths:

```env
LYNC_ENABLED=true
LYNC_ENV=sandbox
LYNC_BASE_URL=
LYNC_API_KEY=
LYNC_SECRET_KEY=
LYNC_CLIENT_ID=
LYNC_CLIENT_SECRET=
LYNC_WEBHOOK_SECRET=
LYNC_CREATE_DVA_PATH=
LYNC_GET_DVA_PATH=
LYNC_VERIFY_FUNDING_PATH=
LYNC_BANKS_PATH=
LYNC_RESOLVE_ACCOUNT_PATH=
LYNC_NGN_TRANSFER_PATH=
LYNC_FX_QUOTE_PATH=
LYNC_FX_PAYOUT_PATH=
LYNC_RECEIPT_PATH=
```

Do not guess the `LYNC_*_PATH` values. Copy them from Lync's official dashboard/docs for the banking API environment you are using. If a live endpoint path is missing, the backend fails fast with a Lync configuration error instead of calling an incorrect route.

Provider request/response logs are stored in `ProviderLog` with sensitive fields masked. Raw Lync responses are never returned directly to Flutter.

## Firebase Cloud Messaging Setup

Create a Firebase project, add the Android and iOS apps in the Firebase console, then give the Flutter app its client config files:

- Android: `google-services.json`
- iOS: `GoogleService-Info.plist`

The backend uses Firebase Admin SDK credentials from environment variables only:

```env
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
FCM_ENABLED=true
```

Do not commit a Firebase service account JSON file. If the private key is stored with escaped newlines, the backend converts `\n` sequences before initializing Firebase.

Flutter should install `firebase_core` and `firebase_messaging`, request notification permission, get the FCM token after login, and call `POST /api/v1/notifications/device-token/register`. On token refresh, Flutter should call the same register endpoint again. On logout, Flutter may call `POST /api/v1/notifications/device-token/remove`. Notification taps should use the FCM `deepLink` data field and then fetch notification/history data from TF backend.

## Fee Configs

Fees can be updated by a `SUPER_ADMIN` or `FINANCE` admin in Swagger:

```text
GET /api/v1/admin/fees
GET /api/v1/admin/fees/ngn_transfer
PATCH /api/v1/admin/fees/ngn_transfer
PATCH /api/v1/admin/fees/usd_transfer
PATCH /api/v1/admin/fees/cny_transfer
PATCH /api/v1/admin/fees/gift_card
```

Example NGN transfer update:

```json
{
  "config": {
    "fee": {
      "mode": "fixed",
      "fixedFee": 100
    }
  }
}
```

Percentage fee rules use basis points and include a cap:

```json
{
  "config": {
    "fee": {
      "mode": "percentage",
      "percentageBps": 50,
      "minFee": 50,
      "maxFee": 500
    }
  }
}
```

Example USD/CNY transfer update:

```json
{
  "config": {
    "fxRate": 1650,
    "providerFee": {
      "mode": "fixed",
      "fixedFee": 2500
    },
    "tfFee": {
      "mode": "percentage",
      "percentageBps": 50,
      "minFee": 1000,
      "maxFee": 5000
    },
    "estimatedSettlementTime": "1-3 business days"
  }
}
```

Example gift card update:

```json
{
  "config": {
    "usdFxRate": 1680,
    "cnyFxRate": 230,
    "fee": {
      "mode": "fixed",
      "fixedFee": 1000
    }
  }
}
```

## Useful Commands

```bash
npm run build
npm run lint
npm test
npm run prisma:migrate
npm run prisma:deploy
```

## Admin Seed

The seed creates an admin user using:

```text
ADMIN_PHONE_NUMBER=2348000000000
ADMIN_PASSCODE=12345
```

Change these values in `.env` before running `npm run prisma:seed` in shared environments.
