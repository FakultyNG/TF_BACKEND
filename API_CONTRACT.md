# TF API Contract

## Purpose

This file defines the API contract between the TF Flutter mobile app and the TF backend.

The Flutter app must only call TF backend APIs.

The Flutter app must NOT call:
- Lync directly
- Prembly or any KYC provider directly
- Sendchamp or any OTP provider directly
- Flutterwave directly
- Bill payment providers directly
- Gift card providers directly
- Push notification providers directly

All third-party provider integrations must happen only on the backend.

## Provider Integration Policy

Lync is the backend provider integration for DVA, wallet funding verification, NGN bank/account validation, NGN transfer submission, FX quotes, and USD/CNY payouts when `LYNC_ENABLED=true`.

When `LYNC_ENABLED=false`, the backend must use `MockLyncProvider` with the same Transfa request/response formats and `provider=mock_lync` in backend metadata.

The Flutter app must not receive Lync credentials, raw Lync payloads, or Lync endpoint paths. Mobile routes remain business routes such as `/wallet/dva/create`, `/funding/verify`, `/transfers/ngn/quote`, `/transfers/ngn/confirm`, `/transfers/usd/quote`, and `/transfers/cny/confirm`.

Sendchamp is the backend OTP provider when `OTP_PROVIDER=sendchamp` and `OTP_DEV_MODE=false`. Flutter continues to call only TF backend routes:

```text
POST /api/v1/auth/otp/send
POST /api/v1/auth/otp/resend
POST /api/v1/auth/otp/validate
```

The backend calls Sendchamp `/verification/create` and `/verification/confirm`, sends SMS OTPs with route `non_dnd`, stores only the TF OTP reference and provider reference in Redis, and never exposes `SENDCHAMP_API_KEY` or raw Sendchamp payloads to Flutter. In local development only, `OTP_DEV_MODE=true` may use the fixed mock OTP `123456`.

Provider callbacks use:

```text
POST /api/v1/webhooks/lync
POST /api/v1/webhooks/prembly
POST /api/v1/webhooks/sendchamp
```

Provider webhook routes are not JWT-protected. They must verify the provider signature using the matching webhook secret, store a `WebhookLog`, normalize the event, enforce idempotency, and then update Transfa ledger/transaction/KYC state. Duplicate valid webhooks must return success without repeating wallet credit, reversal, or KYC activation.

Sendchamp webhooks are delivery-status logs only. They must not verify OTPs, mark OTP sessions verified, log raw OTP codes, or change auth state. OTP verification remains controlled by the backend calling Sendchamp `/verification/confirm` from `POST /auth/otp/validate`.

---

# Base URLs

## Local Development

```text
http://localhost:4000/api/v1 

```

## Staging

```text
https://staging.transfaintel.xyz/api/v1

```

## Production

```text
https://api.transfaintel.xyz/api/v1

```





# Standard Response Format


## Success
```JSON
{
  "success": true,
  "message": "Request successful",
  "data": {}
}
```
## Error
```JSON
{
  "success": false,
  "message": "Something went wrong",
  "error": {
    "code": "ERROR_CODE"
  }
}
```

# Authentication 

Authenticated endpoints require:

Authorization: Bearer access_token

1. OTP

Phone number is the primary user identifier.

The login flow is:

Phone number + Passcode

OTP is used for phone verification and sensitive actions.

Provider behavior:
- Supported OTP purposes are `registration`, `login_verification`, `passcode_reset`, `sensitive_action`, and legacy `phone_verification`.
- Send/resend is rate limited per phone number and purpose.
- Validation allows a maximum of 3 attempts per OTP reference unless configured otherwise.
- Redis tracks `otpReference`, `phoneNumber`, `provider`, `providerReference`, `purpose`, `attempts`, `expiresAt`, and `verified`.
- Sendchamp SMS is used for live OTP delivery. The backend confirms OTPs with Sendchamp during validation.
- Local development may use `OTP_DEV_MODE=true` and `MOCK_OTP_CODE=123456`.
- Common OTP error codes: `INVALID_PHONE_NUMBER`, `OTP_SEND_FAILED`, `OTP_INVALID`, `OTP_EXPIRED`, `OTP_TOO_MANY_ATTEMPTS`, `OTP_VERIFICATION_FAILED`, `OTP_PROVIDER_UNAVAILABLE`.


## Send OTP

POST /auth/otp/send

### Request

```JSON
{
  "phoneNumber": "08103100000"
}
```
### Success Response
```JSON
{
  "success": true,
  "message": "OTP sent successfully",
  "data": {
    "phoneNumber": "2348103100000",
    "otpReference": "otp_ref_12345"
  }
}
```

## Resend OTP

POST /auth/otp/resend

### Request
```JSON
{
  "phoneNumber": "08103100000",
  "otpReference": "otp_ref_12345"
}
```
### Success Response
```JSON
{
  "success": true,
  "message": "OTP resent successfully",
  "data": {
    "otpReference": "otp_ref_67890"
  }
}
```

## Validate OTP

POST /auth/otp/validate

### Request
```JSON
{
  "phoneNumber": "08103100000",
  "otp": "123456",
  "otpReference": "otp_ref_12345"
}
```
### Success Response
```JSON
{
  "success": true,
  "message": "OTP validated successfully",
  "data": {
    "phoneVerified": true,
    "phoneNumber": "2348103100000"
  }
}
```

2. REGISTRATION

## Start Registration

POST /auth/register/start

This checks/verifies the user's phone number and prepares registration.

### Request
```JSON
{
  "phoneNumber": "08103100000"
}
```
### Success Response
```JSON
{
  "success": true,
  "message": "Registration started successfully",
  "data": {
    "registrationToken": "reg_temp_12345",
    "phoneNumber": "2348103100000",
    "requiresOtp": true
  }
}
```

## Complete Registration

POST /auth/register/complete

This endpoint creates the real TF user account only after pre-registration KYC has been completed successfully with the same `registrationToken`.

If BVN or selfie verification has not passed, the backend returns:

```JSON
{
  "success": false,
  "message": "KYC verification is required to complete registration",
  "error": {
    "code": "REGISTRATION_KYC_REQUIRED"
  }
}
```

### Request
```JSON
{
  "registrationToken": "reg_temp_12345",
  "passcode": "12345"
}
```
### Success Response
```JSON
{
  "success": true,
  "message": "Registration completed successfully",
  "data": {
    "accessToken": "jwt_access_token",
    "refreshToken": "jwt_refresh_token",
    "user": {
      "id": "usr_12345",
      "phoneNumber": "2348103100000",
      "kycStatus": "verified",
      "walletStatus": "active"
    }
  }
}
```

# BVN / KYC

BVN verification is required before DVA creation, wallet activation, wallet funding, and transfers.

Current KYC provider: backend-selected provider. `KYC_PROVIDER=prembly` uses Prembly server-side; `KYC_PROVIDER=mock` is for local development.

The frontend must not call KYC providers directly.
The frontend must not call Prembly directly.

Prembly server-side implementation:

- BVN Advance: `POST {PREMBLY_BASE_URL}/verification/bvn`
- BVN + Face Validation: `POST {PREMBLY_BASE_URL}/verification/bvn_w_face`
- Status lookup: `GET {PREMBLY_BASE_URL}/verification/:id/status`
- Headers are sent server-side only: `app-id`, `x-api-key`, and JSON content headers.
- `KYC_FACE_MATCH_THRESHOLD` defaults to `95`.
- PostgreSQL stores BVN/NIN hashes or masked values only. Plain BVN is kept only in Redis for the short temporary KYC/session TTL needed between BVN verification and selfie validation.

1. Verify BVN During Registration

POST /kyc/bvn/verify

This endpoint verifies BVN during onboarding before a JWT exists. It is scoped by `registrationToken`.

Legacy authenticated KYC is still supported by omitting `registrationToken` and sending a valid `Authorization: Bearer access_token` header, but new mobile registration should use `registrationToken`.

## Request
```JSON
{
  "registrationToken": "reg_temp_12345",
  "bvn": "12345678901"
}
```
## Success Response
```JSON
{
  "success": true,
  "message": "BVN verified successfully",
  "data": {
    "kycReference": "kyc_ref_12345",
    "bvnVerified": true,
    "firstName": "John",
    "lastName": "Musa",
    "email": "test@test.com",
    "dateOfBirth": "yyyy-mm-dd",
    "country": "Nigeria",
  }
}
```

2. Validate BVN with Selfie During Registration

POST /kyc/bvn/selfie-validate

This endpoint validates the user's live selfie against the BVN identity record.

The frontend captures the selfie image and sends it to TF backend.

TF backend cleans the base64 image and calls the KYC provider.

The frontend must not call Prembly or any provider directly.

## Request

```json
{
  "registrationToken": "reg_temp_12345",
  "kycReference": "kyc_ref_12345",
  "selfieImageBase64": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAgAAAQABAAD..."
}
```
## Success Response
```JSON
{
  "success": true,
  "message": "Selfie validation successful",
  "data": {
    "kycStatus": "verified",
    "faceMatch": true,
    "confidenceScore": 99.9962,
    "profileImageUrl": "https://res.cloudinary.com/dcqfxryee/image/upload/v174852/profile_usr_12345.jpg"
  }
}
```

3. Get KYC Status

GET /kyc/status

## Success Response
```JSON
{
  "success": true,
  "message": "KYC status fetched successfully",
  "data": {
    "kycStatus": "verified",
    "provider": "prembly",
    "bvnVerified": true,
    "selfieVerified": true,
    "walletEligible": true
  }
}
```

# LOGIN

1. Login with Phone and Passcode

POST /auth/login

## Request
```JSON
{
  "phoneNumber": "08103100000",
  "passcode": "12345"
}
```
## Success Response
```JSON
{
  "success": true,
  "message": "Login successful",
  "data": {
    "accessToken": "jwt_access_token",
    "refreshToken": "jwt_refresh_token",
    "user": {
      "id": "usr_12345",
      "phoneNumber": "2348103100000",
      "kycStatus": "verified",
      "walletStatus": "active"
    }
  }
}
```

2. Refresh Token

POST /auth/refresh-token

## Request
```JSON
{
  "refreshToken": "jwt_refresh_token"
}
```
## Success Response
```JSON
{
  "success": true,
  "message": "Token refreshed successfully",
  "data": {
    "accessToken": "new_jwt_access_token"
  }
}
```

3. Logout

POST /auth/logout

## Success Response
```JSON
{
  "success": true,
  "message": "Logged out successfully",
  "data": {
    "loggedOut": true
  }
}
```



# PASSCODE

Passcode is a 5-digit numeric app password.

1. Change Passcode

PATCH /auth/passcode/change

## Request
```JSON
{
  "oldPasscode": "12345",
  "newPasscode": "54321"
}
```
## Success Response
```JSON
{
  "success": true,
  "message": "Passcode changed successfully",
  "data": {
    "changed": true
  }
}
```
2. Reset Passcode

POST /auth/passcode/reset/request

Sends OTP to the user's registered phone number.

## Request
```json
{
  "phoneNumber": "08103100000"
}
```

## Success Response

```json
{
  "success": true,
  "message": "Passcode reset OTP sent successfully",
  "data": {
    "otpReference": "otp_ref_x7ab92"
  }
}
```

3. Verify Passcode Reset OTP

POST /auth/passcode/reset/verify

## Request

```json
{
  "phoneNumber": "08103100000",
  "otp": "123456",
  "otpReference": "otp_ref_x7ab92"
}
```

## Success Response

```json
{
  "success": true,
  "message": "OTP verified successfully",
  "data": {
    "resetToken": "reset_temp_12345"
  }
}
```

4. Complete Passcode Reset

POST /auth/passcode/reset/complete

## Request

```json
{
  "resetToken": "reset_temp_12345",
  "newPasscode": "54321"
}
```

## Success Response

```json
{
  "success": true,
  "message": "Passcode reset successfully",
  "data": {
    "reset": true
  }
}
```

# DEDICATED VIRTUAL ACCOUNT

DVA is created only after required KYC is completed.

Backend uses verified BVN and phone number to request DVA from provider.

Frontend must not call provider directly.

1. Create Dedicated Virtual Account

POST /wallet/dva/create

## Request
```json
{
  "preferredBank": "auto"
}
Success Response
{
  "success": true,
  "message": "Dedicated virtual account created successfully",
  "data": {
    "bankName": "Wema Bank",
    "accountNumber": "1234567890",
    "accountName": "TransFa JOHN MUSA",
    "provider": "lync",
    "status": "active"
  }
}
```

2. Get Dedicated Virtual Account

GET /wallet/dva

## Success Response
```json
{
  "success": true,
  "message": "Dedicated virtual account fetched successfully",
  "data": {
    "bankName": "Wema Bank",
    "accountNumber": "1234567890",
    "accountName": "TransFa JOHN MUSA",
    "provider": "lync",
    "status": "active"
  }
}
```


# WALLET

Users only hold NGN wallet balance in the app.

USD and CNY are payout currencies, not wallet balances.

1. Get Wallet Balance

GET /wallet/balance

## Success Response
```json
{
  "success": true,
  "message": "Wallet balance fetched successfully",
  "data": {
    "balance": 250000,
    "currency": "NGN",
    "status": "active"
  }
}
```

2. Get Wallet Summary

GET /wallet/summary

## Success Response
```json
{
  "success": true,
  "message": "Wallet summary fetched successfully",
  "data": {
    "balance": 250000,
    "currency": "NGN",
    "totalInflow": 500000,
    "totalOutflow": 250000,
    "pendingTransactions": 1
  }
}
```

# FUNDING

Funding happens when user transfers to their DVA.

Provider webhook confirms funding.

The app may also request manual verification using transaction reference.

1. Verify Funding

POST /funding/verify

## Request
```json
{
  "reference": "TRFA_REF_12345"
}
```

## Success Response
```json
{
  "success": true,
  "message": "Funding verified successfully",
  "data": {
    "transactionId": "txn_001",
    "amount": 50000,
    "currency": "NGN",
    "status": "successful"
  }
}
```


# NGN TRANSFER

1. Get Banks

GET /transfers/ngn/banks

## Success Response
```json
{
  "success": true,
  "message": "Banks fetched successfully",
  "data": [
    {
      "code": "044",
      "name": "Access Bank"
    },
    {
      "code": "058",
      "name": "GTBank"
    }
  ]
}
```

2. Resolve Account

POST /transfers/ngn/resolve-account

## Request
```json
{
  "bankCode": "044",
  "accountNumber": "0123456789"
}
```

## Success Response
```json
{
  "success": true,
  "message": "Account resolved successfully",
  "data": {
    "accountName": "JOHN DOE",
    "accountNumber": "0123456789",
    "bankCode": "044",
    "bankName": "Access Bank"
  }
}
```

3. Suggest Banks by Account Number

POST /transfers/ngn/suggest-banks

This endpoint is used when the user enters a 10-digit NGN account number and the app wants possible bank/account matches before the user selects a bank. The backend returns up to 3 suggestions ordered by highest confidence first.

## Request
```json
{
  "accountNumber": "0123456789"
}
```

## Success Response
```json
{
  "success": true,
  "message": "Bank suggestions fetched successfully",
  "data": {
    "accountNumber": "0123456789",
    "suggestions": [
      {
        "accountName": "JOHN DOE",
        "accountNumber": "0123456789",
        "bankCode": "044",
        "bankName": "Access Bank",
        "confidence": 95
      },
      {
        "accountName": "JOHN DOE",
        "accountNumber": "0123456789",
        "bankCode": "058",
        "bankName": "GTBank",
        "confidence": 88
      },
      {
        "accountName": "JOHN DOE",
        "accountNumber": "0123456789",
        "bankCode": "035",
        "bankName": "Wema Bank",
        "confidence": 80
      }
    ]
  }
}
```

Notes:
- Mobile should call this after the account number reaches 10 digits.
- Suggestions are capped at 3 and sorted by `confidence` descending. Mobile should display them in the returned order.
- If more than one suggestion is returned, the user should select the correct bank before proceeding.
- The backend still requires `bankCode` and `accountNumber` for `/transfers/ngn/resolve-account` and `/transfers/ngn/quote`.
- In local mock mode, suggestions are deterministic placeholders. Production behavior depends on the NGN provider's account lookup/name-enquiry support.

4. NGN Transfer Quote

POST /transfers/ngn/quote

## Request
```json
{
  "bankCode": "044",
  "accountNumber": "0123456789",
  "amount": 10000,
  "narration": "TF Transfer"
}
```

## Success Response
```json
{
  "success": true,
  "message": "Transfer quote generated successfully",
  "data": {
    "amount": 10000,
    "fee": 50,
    "totalDebit": 10050,
    "currency": "NGN",
    "quoteId": "quote_ngn_12345",
    "narration": "TF Transfer",
    "expiresAt": "2026-05-25T10:35:00Z"
  }
}
```

5. Confirm NGN Transfer

POST /transfers/ngn/confirm

## Request
```json
{
  "quoteId": "quote_ngn_12345",
  "passcode": "12345",
  "narration": "TF Transfer"
}
```

## Success Response
```json
{
  "success": true,
  "message": "Transfer submitted successfully",
  "data": {
    "transactionId": "txn_002",
    "status": "processing",
    "amount": 10000,
    "currency": "NGN",
    "narration": "TF Transfer"
  }
}
```


# USD TRANSFER

USD transfer is a payout flow, User pays from NGN wallet.

Backend handles FX, provider routing, payout, and reconciliation.
This endpoint receives the full USD transfer details before quote generation.

The backend validates the beneficiary details, calculates fees, checks payout route availability, and returns a locked quote.

1. USD Transfer Quote

POST /transfers/usd/quote

## Request

```json
{
  "amount": 100,
  "recipientCountry": "US",
  "purpose": "supplier_payment",
  "paymentReference": "Invoice #US-9282",
  "beneficiary": {
    "bankName": "Bank of America",
    "accountNumber": "1234567890",
    "accountName": "ABC Trading Ltd",
    "swiftCode": "BOFAUS3N",
    "routingNumber": "026009593"
  }
}
```

## Success Response

```json
{
  "success": true,
  "message": "USD transfer quote generated successfully",
  "data": {
    "quoteId": "quote_usd_12345",
    "payoutCurrency": "USD",
    "payoutAmount": 100,
    "purpose": "supplier_payment",
    "recipientName": "ABC Trading Ltd",
    "recipientCountry": "US",
    "fxRate": 1650,
    "providerFee": 2500,
    "tfFee": 1500,
    "totalNgnDebit": 169000,
    "estimatedSettlementTime": "1-3 business days",
    "expiresAt": "2026-05-25T10:35:00Z"
  }
}
```

2. Confirm USD Transfer

POST /transfers/usd/confirm

This endpoint confirms a previously generated quote.

The backend uses the quoteId to retrieve the stored transfer details.

## Request

```json
{
  "quoteId": "quote_usd_12345",
  "passcode": "12345",
  "purpose": "supplier_payment"
}
```

### Success Response

```json
{
  "success": true,
  "message": "USD transfer submitted successfully",
  "data": {
    "transactionId": "txn_usd_001",
    "status": "processing",
    "payoutAmount": 100,
    "purpose": "supplier_payment",
    "payoutCurrency": "USD",
    "totalNgnDebit": 169000
  }
}
```


# CNY TRANSFER

CNY transfer is a payout flow, User pays from NGN wallet.

Backend handles FX, provider routing, payout, and reconciliation.
This endpoint receives the full chineese CNY transfer details before quote generation.

The backend validates the beneficiary details, calculates fees, checks payout route availability, and returns a locked quote.

1. CNY Transfer Quote

POST /transfers/usd/quote

## Request
```json
{
  "amount": 5000,
  "recipientCountry": "China",
  "purpose": "supplier_payment",
  "paymentReference": "Invoice #CN-9282",
  "beneficiary": {
    "bankName": "Bank of China",
    "accountNumber": "1234567890",
    "accountName": "Shenzhen ABC Trading Ltd",
    "swiftCode": "BKCHCNBJ"
  }
}
```

### Success Response

```json
{
  "success": true,
  "message": "CNY transfer quote generated successfully",
  "data": {
    "quoteId": "quote_cny_12345",
    "payoutCurrency": "CNY",
    "payoutAmount": 5000,
    "purpose": "supplier_payment",
    "recipientName": "Shenzhen ABC Trading Ltd",
    "recipientCountry": "China",
    "fxRate": 230,
    "providerFee": 3000,
    "tfFee": 2500,
    "totalNgnDebit": 1155500,
    "estimatedSettlementTime": "1-3 business days",
    "expiresAt": "2026-05-25T10:35:00Z"
  }
}
```

2. Confirm CNY Transfer

POST /transfers/cny/confirm

This endpoint confirms a previously generated quote.

The backend uses the quoteId to retrieve the stored transfer details.

## Request

```json
{
  "quoteId": "quote_cny_12345",
  "passcode": "12345",
  "purpose": "supplier_payment"
}
```

## Success Response

```json
{
  "success": true,
  "message": "CNY transfer submitted successfully",
  "data": {
    "transactionId": "txn_cny_001",
    "status": "processing",
    "payoutAmount": 5000,
    "purpose": "supplier_payment",
    "payoutCurrency": "CNY",
    "totalNgnDebit": 1155500
  }
}
```


# GIFT CARDS

1. List Gift Cards

GET /gift-cards

## Success Response
```json
{
  "success": true,
  "message": "Gift cards fetched successfully",
  "data": [
    {
      "id": "gift_reeplay_usd",
      "name": "Reeplay Gift Card",
      "currency": "USD",
      "minAmount": 10,
      "maxAmount": 2500
    }
  ]
}
```

2. Gift Card Quote

POST /gift-cards/quote

## Request
```json
{
  "giftCardId": "gift_reeplay_usd",
  "amount": 50,
  "currency": "USD"
}
```

## Success Response
```json
{
  "success": true,
  "message": "Gift card quote generated successfully",
  "data": {
    "quoteId": "quote_gift_12345",
    "giftCardId": "gift_reeplay_usd",
    "giftCardName": "Reeplay Gift Card",
    "amount": 50,
    "currency": "USD",
    "totalNgnDebit": 85000,
    "fee": 1000,
    "expiresAt": "2026-05-25T10:35:00Z"
  }
}
```

3. Create/Buy Gift Card

POST /gift-cards/create

## Request
```json
{
  "quoteId": "quote_gift_12345",
  "passcode": "12345"
}
```

## Success Response
```json
{
  "success": true,
  "message": "Gift card purchase submitted successfully",
  "data": {
    "transactionId": "txn_gift_001",
    "status": "processing",
    "giftCardName": "Reeplay Gift Card",
    "amount": 50,
    "currency": "USD"
  }
}
```

4. Get Gift Card Details

GET /gift-cards/:id

## Success Response
```json
{
  "success": true,
  "message": "Gift card details fetched successfully",
  "data": {
    "id": "gift_purchase_001",
    "giftCardName": "Amazon Gift Card",
    "amount": 50,
    "currency": "USD",
    "status": "delivered",
  }
}
```


# SUPPORT TICKETS

Support tickets are linked to:
- transactions
- wallet funding
- KYC
- transfer issues
- account issues

when creating support ticket, transactionId is optional.
If provided, backend attaches transaction metadata.
If not provided, backend creates a general support ticket.

1. Create Support Ticket

`POST /support/tickets`

Creates a support ticket.
If transactionId is provided, backend automatically attaches transaction metadata.

## Request

```json
{
  "transactionId": "txn_usd_001",
  "subject": "Recipient has not received payment",
  "message": "The transfer is still pending after 24 hours."
}
```

## Success Response

```json
{
  "success": true,
  "message": "Support ticket created successfully",
  "data": {
    "ticketId": "ticket_12345",
    "status": "open",
    "createdAt": "2026-05-25T10:35:00Z"
  }
}
```

2. Get User Tickets

`GET /support/tickets`

## Success Response

```json
{
  "success": true,
  "message": "Support tickets fetched successfully",
  "data": {
    "items": [
      {
        "ticketId": "ticket_12345",
        "subject": "Recipient has not received payment",
        "status": "in_review",
        "createdAt": "2026-05-25T10:35:00Z"
      }
    ]
  }
}
```

3. Get Ticket Details

`GET /support/tickets/:ticketId`

## Success Response

```json
{
  "success": true,
  "message": "Support ticket details fetched successfully",
  "data": {
    "ticketId": "ticket_12345",
    "transactionId": "txn_usd_001",
    "subject": "Recipient has not received payment",
    "status": "in_review",
    "messages": [
      {
        "sender": "user",
        "message": "The transfer is still pending after 24 hours.",
        "createdAt": "2026-05-25T10:35:00Z"
      },
      {
        "sender": "support",
        "message": "We are currently checking with the provider.",
        "createdAt": "2026-05-25T11:00:00Z"
      }
    ]
  }
}
```

4. Reply to Ticket

`POST /support/tickets/:ticketId/reply`

## Request

```json
{
  "message": "Any update on this issue?"
}
```

## Success Response

```json
{
  "success": true,
  "message": "Reply sent successfully",
  "data": {
    "ticketId": "ticket_12345",
    "replyId": "reply_001"
  }
}
```

5. Close Ticket

`POST /support/tickets/:ticketId/close`

## Success Response

```json
{
  "success": true,
  "message": "Ticket closed successfully",
  "data": {
    "ticketId": "ticket_12345",
    "status": "closed"
  }
}
```

# TRANSACTIONS

1. Get Transaction History

GET /transactions

## Optional Query Params
?type=ngn_transfer&status=successful&page=1&limit=20

### Success Response
```json
{
  "success": true,
  "message": "Transactions fetched successfully",
  "data": {
    "items": [
      {
        "id": "txn_001",
        "type": "wallet_funding",
        "amount": 50000,
        "currency": "NGN",
        "status": "successful",
        "description": "Wallet funding",
        "createdAt": "2026-05-25T10:30:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1
    }
  }
}
```

2. Get Transaction Details

GET /transactions/:id

### Success Response
```json
{
  "success": true,
  "message": "Transaction fetched successfully",
  "data": {
    "id": "txn_001",
    "type": "wallet_funding",
    "amount": 50000,
    "currency": "NGN",
    "status": "successful",
    "reference": "TF-20260525-001",
    "description": "Wallet funding",
    "createdAt": "2026-05-25T10:30:00Z"
  }
}
```


# PROFILE

1. Get Profile

GET /profile

## Success Response
```json
{
  "success": true,
  "message": "Profile fetched successfully",
  "data": {
    "id": "usr_12345",
    "firstName": "John",
    "lastName": "Musa",
    "email": "test@test.com",
    "phoneNumber": "2348103100000",
    "dateOfBirth": "yyyy-mm-dd",
    "gender": "Male",
    "kycStatus": "verified",
    "walletStatus": "active"
  }
}
```

2. Update Profile

PATCH /profile

## Request
```json
{
    "firstName": "newfirstname",
    "lastName": "newlastname",
    "email": "newemail@test.com",
    "phoneNumber": "2348103100000",
    "dateOfBirth": "yyyy-mm-dd",
    "kycStatus": "verified"   
}
```
## Success Response
```json
{
  "success": true,
  "message": "Profile updated successfully",
  "data": {
    "firstName": "newfirstname",
    "lastName": "newlastname",
    "email": "newemail@test.com",
    "phoneNumber": "2348103100000",
    "dateOfBirth": "yyyy-mm-dd",
    "kycStatus": "verified"
  }
}
```


# BIOMETRICS

Biometric authentication is handled locally on the mobile device.

## Supported methods:
Face ID
Fingerprint

The backend does not receive or store biometric data.

## The frontend handles:
device biometric check
Face ID prompt
fingerprint prompt
secure local token storage

## The backend handles:
enabling biometric login
disabling biometric login
confirming biometric login session
tracking biometric status
Get Biometric Status


1. Get Biometric Status

GET /auth/biometric/status

### Success Response
```json
{
  "success": true,
  "message": "Biometric status fetched successfully",
  "data": {
    "enabled": true,
    "method": "face_id",
    "deviceId": "device_12345"
  }
}
```

2. Enable Biometric Login

`POST /auth/biometric/enable`

The frontend automatically detects the biometric method supported by the device. If the device supports multiple biometric types or the exact type cannot be determined, use "biometric".

Possible methods:
- face_id
- fingerprint

### Request

```json
{
  "method": "face_id",
  "deviceId": "device_12345"
}
```

### Success Response
```json
{
  "success": true,
  "message": "Biometric login enabled successfully",
  "data": {
    "enabled": true,
    "method": "face_id",
    "deviceId": "device_12345"
  }
}
```

3. Disable Biometric Login

POST /auth/biometric/disable

### Request
```json
{
  "deviceId": "device_12345"
}
```

### Success Response
```json
{
  "success": true,
  "message": "Biometric login disabled successfully",
  "data": {
    "enabled": false
  }
}
```

4. Biometric Login

POST /auth/biometric/login

This endpoint is called after the frontend successfully completes local biometric authentication.

### Request
```json
{
  "deviceId": "device_12345"
}
```

### Success Response
```json
{
  "success": true,
  "message": "Biometric login successful",
  "data": {
    "accessToken": "jwt_access_token",
    "refreshToken": "jwt_refresh_token",
    "user": {
      "id": "usr_12345",
      "phoneNumber": "2348103100000",
      "kycStatus": "verified",
      "walletStatus": "active"
    }
  }
}
```


# NOTIFICATIONS

## Notifications support:
- app updates
- wallet activities
- transfer alerts
- security alerts
- KYC updates
- support updates
- promotional campaigns

## The frontend controls:
- colors
- icons
- card styles
- badges

### based on:
- notificationCategory
- priority
- type

## Backend sends semantic notification data only.



1. Get Notifications

`GET /notifications?page=1&limit=20`

#### Success Response

```json
{
  "success": true,
  "message": "Notifications fetched successfully",
  "data": {
    "items": [
      {
        "id": "notif_001",
        "type": "app_update",
        "notificationCategory": "update",
        "mainHeader": "Software Update",
        "subHeader": "Transfa 1.5",
        "body": "Transfa 1.5 intoduces list for vendors",
        "imageUrl": "https://tfapp.com/update-banner.png",
        "priority": "normal",
        "deepLink": "tf://wallet",
        "ctaText": "Get Transfa",
        "ctaUrl": "https://appstore.com/tf",
        "isRead": false,
        "createdAt": "2026-05-25T10:30:00Z"
      },
      {
        "id": "notif_002",
        "type": "security_alert",
        "notificationCategory": "security",
        "header": "New Login Detected",
        "body": "Your TF account was accessed from a new device.",
        "imageUrl": "https://tfapp.com/update-banner.png",
        "priority": "high",
        "deepLink": "tf://security/activity",
        "isRead": false,
        "createdAt": "2026-05-25T11:00:00Z"
      },
      {
        "id": "notif_003",
        "type": "usd_transfer",
        "notificationCategory": "transactions",
        "header": "Edward Bette",
        "body": "Sent $420 for Goof",
        "imageUrl": "https://tfapp.com/update-banner.png",
        "priority": "high",
        "deepLink": "tf://security/activity",
        "isRead": false,
        "createdAt": "2026-05-25T11:00:00Z"
      },
      {
        "id": "notif_004",
        "type": "promotion",
        "notificationCategory": "system",
        "header": "Get a Transfa card",
        "body": "Transfa card is now available for collection.",
        "imageUrl": "https://tfapp.com/update-banner.png",
        "priority": "high",
        "deepLink": "tf://security/activity",
        "isRead": false,
        "createdAt": "2026-05-25T11:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 2
    }
  }
}
```


2. Mark Notification As Read

`PATCH /notifications/:notificationId/read`

#### Success Response

```json
{
  "success": true,
  "message": "Notification marked as read successfully",
  "data": {
    "notificationId": "notif_001",
    "isRead": true
  }
}
```



3. Mark All Notifications As Read

`PATCH /notifications/read-all`

#### Success Response

```json
{
  "success": true,
  "message": "All notifications marked as read successfully",
  "data": {
    "updated": true
  }
}
```

4. Notification Categories

```text
system
transactions
update
security
```


5. Notification Priorities

```text
low
normal
high
critical
```


6. Notification Types

```text
app_update
wallet_funded
wallet_debited
ngn_transfer
usd_transfer
cny_transfer
processing
security_alert
kyc_verified
kyc_rejected
support_reply
promotion
```

## Frontend Rendering Rules

Frontend should:
- determine colors from notificationCategory/type
- determine icons from notificationCategory/type
- determine badge styles from priority
- deep link users to the appropriate screen using deepLink
- display CTA button only if ctaText exists


# FIREBASE FCM

1. Notifications Device Tokens

POST /notifications/device-token/register

## Request:
```json
{
  "deviceId": "device_12345",
  "fcmToken": "firebase_device_token",
  "platform": "android"
}
```

### Supported platforms:
- android
- ios
- web

### Behavior:
- authenticated user only
- save or update token
- if same deviceId exists for user, update token
- mark token active
- save platform
- save lastUsedAt

## Response:
```json
{
  "success": true,
  "message": "Device token registered successfully",
  "data": {
    "registered": true
  }
}
```

2. Remove FCM Device Token

POST /notifications/device-token/remove

## Request:
```json
{
  "deviceId": "device_12345"
}
```

### Behavior:
- authenticated user only
- deactivate token for that device/user

## Response:
```json
{
  "success": true,
  "message": "Device token removed successfully",
  "data": {
    "removed": true
  }
}
```

# CASHDROP

## Purpose
CashDrop allows a TF user to scan another user's verified profile image and auto-populate the NGN transfer screen with the receiver's DVA/payment details.

Important:
- This is NOT QR code scanning.
- This is image matching.
- The Flutter app invokes the phone camera, captures the profile image, and sends it to the backend.
- The backend resolves the scanned image against stored verified profile image fingerprints.
- The backend returns receiver payment details if a safe match is found.
- The frontend must not perform image matching locally.
- The frontend must not expose raw DVA lookup logic.


## Product Flow

```text
User completes KYC
→ Selfie is verified
→ Selfie becomes profile image
→ Backend generates image fingerprint/hash
→ Backend links image fingerprint to user's DVA/payment profile

Another user taps Scan to Pay
→ Flutter opens camera
→ User scans/captures receiver's profile image
→ Flutter sends scanned image to backend
→ Backend generates scanned image fingerprint/hash
→ Backend compares scanned fingerprint with stored fingerprints
→ Backend resolves receiver
→ Flutter redirects to NGN transfer screen
→ Receiver DVA details are auto-populated
```

---

## Backend Rule

The backend must only register an image for CashDrop if:

```text
kycStatus = verified
walletStatus = active
profileImageUrl exists
DVA exists and status = active
```

---

1. Register Profile Image for CashDrop

`POST /cash-drop/register`

This links the user's verified selfie image to their payment profile.

The backend should:
- fetch the authenticated user
- confirm KYC is verified
- confirm profile image exists
- confirm DVA exists
- generate image fingerprint/hash from the stored profile image
- link the fingerprint to userId and DVA details
- return Cashdrop registration status

### Request

```json
{
  "useCurrentProfileImage": true
}
```

### Success Response

```json
{
  "success": true,
  "message": "Profile image linked to CashDrop successfully",
  "data": {
    "CashDropId": "cashdrop_12345",
    "userId": "usr_12345",
    "status": "active",
    "linkedToDva": true
  }
}
```

2. Error Response

```json
{
  "success": false,
  "message": "CashDrop registration failed",
  "error": {
    "code": "CASH_DROP_REGISTRATION_FAILED"
  }
}
```

---

3. Get My CashDrop Status

`GET /cash-drop/status`

### Success Response

```json
{
  "success": true,
  "message": "CashDrop status fetched successfully",
  "data": {
    "enabled": true,
    "CashDropId": "cashdrop_12345",
    "profileImageUrl": "https://res.cloudinary.com/dcqfxryee/profileimage/upload/v174852/profile_usr_12345.jpg",
    "status": "active"
  }
}
```

---

4. Disable CashDrop

`POST /cash-drop/disable`

### Request

```json
{
  "reason": "User disabled CashDrop"
}
```

### Success Response

```json
{
  "success": true,
  "message": "CashDrop disabled successfully",
  "data": {
    "enabled": false,
    "status": "disabled"
  }
}
```

---

5. Resolve Scanned Profile Image

`POST /cash-drop/resolve`

The Flutter app calls this after capturing/scanning another user's profile image.

The backend should:
- receive scanned image
- generate image fingerprint/hash
- compare against stored CashDrop fingerprints
- only return a result if confidence is above safe threshold
- return receiver payment profile
- never return multiple users
- fail safely if confidence is low

### Request

```json
{
  "scannedImageBase64": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAgAAAQABAAD..."
}
```

### Success Response

```json
{
  "success": true,
  "message": "Payment profile resolved successfully",
  "data": {
    "receiverId": "usr_12345",
    "displayName": "John Musa",
    "profileImageUrl": "https://res.cloudinary.com/dcqfxryee/profileimage/upload/v174852/profile_usr_12345.jpg",
    "bankName": "Wema Bank",
    "accountNumber": "1234567890",
    "accountName": "TransFa JOHN MUSA",
    "currency": "NGN",
    "matchConfidence": 96.4
  }
}
```

### Low Confidence / No Match Response

```json
{
  "success": false,
  "message": "Could not safely identify this profile image",
  "error": {
    "code": "CASH_DROP_NO_SAFE_MATCH"
  }
}
```

---

## Frontend Flutter Instruction

For CashDrop scanning, the Flutter app should:

```text
1. Use the "CasDrop to Pay" button.
2. Invoke the phone camera using Flutter camera/image capture package.
3. Capture the receiver's displayed profile image.
4. Convert captured image to base64.
5. Send captured image to POST /cash-drop/resolve.
6. If success, navigate to NGN transfer screen.
7. Auto-populate:
   - receiverId
   - displayName
   - profileImageUrl
   - bankName
   - accountNumber
   - accountName
8. User enters amount.
9. User confirms transfer.
```

Recommended Flutter packages:

```text
camera
image_picker
permission_handler
```

Do not use QR code scanner packages for this feature because CashDrop scans profile images, not QR codes.

---

## Frontend Success Behavior

After successful image resolution:

```text
Navigate to:
NGN Transfer Screen

Pre-fill:
- receiver name
- profile image
- bank name
- account number
- account name

Do not allow frontend to edit resolved account details manually before confirmation unless user cancels and starts a normal transfer.
```


# RECENT TRANSFER BENEFICIARIES

## Purpose

Recent transfer beneficiaries allow the app to suggest previous recipients when a user starts typing an account number on any transfer quote screen.

This improves transfer speed by auto-populating saved recipient/payment details.

Supported flows:
- NGN transfers
- USD transfers
- CNY transfers

---

## Backend Rule

The backend should automatically save/update a recent beneficiary after a successful transfer or submitted processing transfer.

The frontend should not manually create recent beneficiaries unless explicitly allowed.

---

1. Search Recent Beneficiaries

`GET /beneficiaries/recent/search?query=0123&type=ngn_transfer`

This endpoint is called while the user types an account number or recipient identifier.

### Query Params

```text
query=0123
type=ngn_transfer
```

Supported `type` values:

```text
ngn_transfer
usd_transfer
cny_transfer
```

### Success Response

```json
{
  "success": true,
  "message": "Recent beneficiaries fetched successfully",
  "data": [
    {
      "beneficiaryId": "ben_12345",
      "type": "ngn_transfer",
      "displayName": "JOHN DOE",
      "bankName": "Access Bank",
      "bankCode": "044",
      "accountNumber": "0123456789",
      "accountName": "JOHN DOE",
      "lastUsedAt": "2026-05-25T10:30:00Z"
    }
  ]
}
```

---

2. Get Recent Beneficiaries

`GET /beneficiaries/recent?type=ngn_transfer`

### Success Response

```json
{
  "success": true,
  "message": "Recent beneficiaries fetched successfully",
  "data": [
    {
      "beneficiaryId": "ben_12345",
      "type": "ngn_transfer",
      "displayName": "JOHN DOE",
      "bankName": "Access Bank",
      "bankCode": "044",
      "accountNumber": "0123456789",
      "accountName": "JOHN DOE",
      "lastUsedAt": "2026-05-25T10:30:00Z"
    }
  ]
}
```

---

3. Delete Recent Beneficiary

`DELETE /beneficiaries/recent/:beneficiaryId`

### Success Response

```json
{
  "success": true,
  "message": "Recent beneficiary deleted successfully",
  "data": {
    "deleted": true
  }
}
```

---

## Frontend Behavior

When user types into account number field:

```text
1. User types at least 3 digits.
2. Flutter calls:
   GET /beneficiaries/recent/search?query=012&type=ngn_transfer
3. App shows matching recent beneficiaries.
4. User taps one beneficiary.
5. App auto-populates:
   - bankName
   - bankCode
   - accountNumber
   - accountName
6. User continues transfer quote flow.
```

For USD/CNY payments, search can match:
- account name
- account number
- bank name
- payment reference
- country

---

# SUPPORT TICKET ATTACHMENTS

## Purpose

Users can attach files/images to support tickets and support replies.

Supported attachment examples:
- payment receipt screenshot
- failed transaction screenshot
- profile/account issue screenshot

Files must be uploaded through TF backend and stored in secure cloud storage such as Cloudinary.

---

1. Upload Support Attachment

`POST /uploads/support-attachment`

Content-Type:

```text
multipart/form-data
```

### Form Fields

```text
file: image/file upload
```

### Success Response

```json
{
  "success": true,
  "message": "Support attachment uploaded successfully",
  "data": {
    "attachmentUrl": "https://res.cloudinary.com/tf/support/attachments/file_12345.jpg",
    "fileName": "receipt.jpg",
    "fileType": "image/jpeg",
    "fileSize": 245000
  }
}
```

---

2. Create Support Ticket with Attachment

`POST /support/tickets`

### Request

```json
{
  "subject": "Wallet funding issue",
  "message": "I funded my wallet but my balance has not updated.",
  "category": "wallet",
  "transactionId": "txn_12345",
  "attachmentUrls": [
    "https://res.cloudinary.com/tf/support/attachments/file_12345.jpg"
  ]
}
```

### Success Response

```json
{
  "success": true,
  "message": "Support ticket created successfully",
  "data": {
    "ticketId": "ticket_12345",
    "status": "open"
  }
}
```

---

3. Reply to Ticket with Attachment

`POST /support/tickets/:ticketId/reply`

### Request

```json
{
  "message": "Here is the screenshot of the failed transaction.",
  "attachmentUrls": [
    "https://res.cloudinary.com/tf/support/attachments/file_67890.jpg"
  ]
}
```

### Success Response

```json
{
  "success": true,
  "message": "Ticket reply sent successfully",
  "data": {
    "messageId": "msg_12345",
    "ticketId": "ticket_12345",
    "status": "open"
  }
}
```

---

## Support Attachment Rules

```text
1. Users can only attach files to their own tickets.
2. Supported files: jpg, jpeg, png, webp, pdf.
3. Maximum file size: 5MB.
4. Files must be uploaded to backend first.
5. Backend uploads files to Cloudinary or secure storage.
6. Frontend sends returned attachmentUrl when creating/replying to ticket.
7. Do not store files permanently on local server.
```

---

# ADMIN KYC MANAGEMENT

Admin endpoints require admin JWT:

```http
Authorization: Bearer admin_access_token
```

## List KYC Records

`GET /admin/kyc-records`

Optional query parameters:

- `take`
- `skip`
- `provider` such as `prembly`, `mock`, or legacy provider values

The response includes provider metadata, provider reference, BVN/selfie status, confidence score, masked BVN/NIN values, identity fields returned by the backend provider adapter, and the related user summary.

# ADMIN USER MANAGEMENT

Admin endpoints require admin JWT:

```text
Authorization: Bearer admin_access_token
```

## Delete User

`DELETE /admin/users/:userId`

This endpoint is restricted to `SUPER_ADMIN`.

Deletion is a backend soft delete. The backend does not hard-delete the user row or financial history. It:
- sets `user.status = disabled`
- sets `user.walletStatus = inactive`
- revokes active auth sessions
- deactivates FCM device tokens
- disables trusted biometric devices
- inactivates active DVA records
- disables CashDrop profile
- writes an admin audit log

### Request

```json
{
  "reason": "User requested account deletion"
}
```

### Success Response

```json
{
  "success": true,
  "message": "User deleted successfully",
  "data": {
    "deleted": true,
    "userId": "usr_12345",
    "status": "disabled"
  }
}
```

### Error Responses

```json
{
  "success": false,
  "message": "User not found",
  "error": {
    "code": "USER_NOT_FOUND"
  }
}
```

```json
{
  "success": false,
  "message": "Admin cannot delete their own account",
  "error": {
    "code": "ADMIN_CANNOT_DELETE_SELF"
  }
}
```


# SECURITY RULES
- The frontend must only call TF backend APIs.
- Provider API keys must never be placed in the mobile app.
- BVN, NIN, selfie images, and KYC data must be stored securely.
- Biometric data must never be sent to the backend.
- All financial actions must require authenticated access.
- Sensitive actions may require OTP or passcode confirmation.
- Payment webhooks must be verified before wallet balances are updated.
- Wallet balance must be controlled by backend ledger, not frontend state.
- Failed transfers must trigger reversal logic.
- API responses must follow the standard response format.

# FRONTEND RULES
- Flutter app must follow this API contract exactly.
- Mock APIs must use the same request and response formats.
- Real backend responses must match this contract.
- If the frontend needs a new field, this file must be updated first.
- The app must not expose provider names to users unless necessary.
- The app must show NGN wallet balance only.
- USD and CNY are payout currencies, not wallet balances.
