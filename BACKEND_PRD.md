# TRANSFA Backend Product Requirements Document

## 1. Product Summary

TRANSFA is a mobile fintech application that lets Nigerian users fund and hold a single NGN wallet, then pay local recipients in NGN or international suppliers/vendors in USD and CNY through a quote-and-transfer workflow.

Users do not hold USD, CNY, or stablecoin balances in the app. All customer-facing wallet balances are NGN-only. Foreign-currency transfers are payout modes powered by backend FX, fee, treasury, stablecoin routing, and third-party payout infrastructure.

Figma review confirms the app surface includes onboarding stories, passcode and biometric security, phone/email verification, NIN/BVN/photo-ID/face-shot verification, home balance, add-money virtual account, wallet utilities, local NGN transfers, Dollar transfer screens, bank discovery, transaction receipts, support chat, notifications, privacy/legal pages, money limits, CashDrop face-based discovery, power bill purchase, MTN mobile data, and Reeplay gift card flows.

Backend implementation must preserve the core product rule: even when the UI shows Dollar transaction histories or Dollar-denominated pay sheets, the system-of-record user wallet remains NGN-only unless a future product decision explicitly introduces foreign-currency wallets.

## 2. Backend Objectives

- Provide secure account, identity, and wallet infrastructure for Flutter clients.
- Maintain an auditable NGN wallet ledger as the only user balance ledger.
- Support NGN wallet funding through dedicated virtual accounts.
- Support NGN local transfers.
- Support USD and CNY supplier payouts using real-time quotes.
- Apply platform FX markup and transfer fee markup before user confirmation.
- Execute international payouts through Lync Global infrastructure.
- Handle asynchronous payout completion, failure, and refund workflows.
- Preserve zero-FX-risk reversals using historical transaction values.
- Provide admin, compliance, reconciliation, and support visibility.
- Support screen-derived product modules shown in Figma: CashDrop, support conversations, notifications, money limits, utility purchases, gift cards, transaction receipts, and legal/privacy content delivery.

### 2.1 Backend Tech Stack

- Node.js runtime.
- NestJS application framework.
- PostgreSQL relational database.
- Prisma ORM and migration tooling.
- Redis for caching, queues, rate limits, sessions, and idempotency locks.
- JWT authentication with refresh token rotation.
- Docker for local development, service packaging, and deployment portability.
- Swagger/OpenAPI for API documentation, contract review, and client integration.

## 3. Core Product Rules

1. Users only hold NGN wallet balances inside TRANSFA.
2. USD and CNY are transfer modes, not wallet balances.
3. Backend owns all FX calculations, stablecoin routing, treasury logic, payout orchestration, and reconciliation.
4. Quotes must expire and must not be reusable after expiry.
5. Transfers must be idempotent across mobile retries, provider retries, and webhook retries.
6. Wallet debits and ledger writes must be atomic.
7. Failed cross-border payouts must refund users in NGN based on the original transaction record, not live FX rates.

## 4. Target Users

- Nigerian importers paying Chinese suppliers.
- Nigerian businesses paying international vendors in USD.
- Small and mid-sized merchants that need simple international payout UX without managing crypto, stablecoins, or foreign wallets.

## 5. Primary User Journeys

### 5.1 Registration and Authentication

Users should be able to:

- Create an account with phone number and/or email.
- Verify OTP.
- Set PIN and optional biometric login on the client.
- Log in with JWT-backed sessions.
- Refresh tokens securely.
- Reset password/PIN through verified recovery flows.

Backend requirements:

- Store users, auth credentials, refresh token sessions, device metadata, and audit events.
- Hash passwords/PINs using strong one-way hashing.
- Support token revocation per device and globally.
- Rate-limit OTP, login, password reset, PIN attempts, and sensitive actions.

### 5.2 KYC and Compliance

Users should complete progressive KYC before accessing higher-risk features.

Suggested tiers:

- Tier 0: registered but unverified; no transfers.
- Tier 1: BVN/NIN and basic profile; limited wallet funding and NGN transfers.
- Tier 2: address/business details; increased limits and international payouts.
- Tier 3: enhanced due diligence for high-volume users.

Figma labels money-limit tiers as `Citizen`, `Captain`, and `Prime`, with limits shown for send, receive, and max balance. Backend should map these product names to enforceable KYC tiers and limits.

Backend requirements:

- KYC status machine: `not_started`, `pending`, `verified`, `rejected`, `requires_resubmission`, `restricted`.
- Store verification provider references, not raw sensitive documents unless required.
- Enforce transaction limits by KYC tier.
- Screen recipients and high-risk transactions where provider support exists.
- Maintain immutable audit trail for compliance decisions.
- Support Startkey/OTP verification for phone/email onboarding.
- Support NIN and BVN OTP confirmation flows.
- Support photo ID type capture: passport, national ID, national ID slip, and driver's license.
- Support face-shot/liveness verification status and retry reasons such as face not recognized.
- Support address capture and verification, including power-bill-assisted address validation shown in the design.

### 5.3 NGN Wallet Funding

Users fund their wallet through a dedicated virtual account provisioned by Lync Global.

Backend requirements:

- Create or fetch a dedicated virtual account per eligible user.
- Receive funding webhooks.
- Verify webhook signature and event uniqueness.
- Credit user NGN wallet through double-entry ledger entries.
- Notify mobile client of successful credit.
- Reconcile provider deposits against internal ledger.

Key states:

- `virtual_account_pending`
- `virtual_account_active`
- `funding_pending`
- `funding_confirmed`
- `funding_failed`
- `funding_reversed`

### 5.4 NGN Local Transfers

Users can transfer NGN from their wallet to local Nigerian bank accounts.

Backend requirements:

- Bank list and account-name lookup.
- Account number lookup can return multiple banks; client must receive options for the user to choose from.
- Saved recipient lookup can return multiple bank accounts for one recipient; client must receive account options.
- Transfer fee calculation if applicable.
- Optional dispute protection/stamp-duty style fees must be represented as explicit quote line items, not hidden in the principal.
- PIN confirmation.
- Atomic wallet debit.
- Lync NGN transfer initiation.
- Webhook-driven completion/failure.
- Refund on failed transfer according to transaction failure reason.
- Receipts must include recipient, memo, status, fees, total, timestamp, transaction ID, funding source, support link, and share/save metadata.

### 5.5 USD Supplier Payout

User enters the amount the receiver must get in USD. Backend quotes the NGN cost including FX markup and processing fee.

Required USD beneficiary fields:

- Receiver name
- Bank name
- Routing number
- Account number
- SWIFT/BIC
- Receiver address where required by provider/compliance rules
- Optional narration/invoice reference

USD fee rules:

- Lync base outbound cost: `$10`.
- TRANSFA user-facing processing fee: `$15`.
- Platform profit on fee: `$5`.
- TRANSFA FX markup: `+20 NGN` over Lync wholesale NGN/USD rate.

Quote formula:

```text
marked_rate_ngn_per_usd = lync_wholesale_rate_ngn_per_usd + 20
foreign_fee_usd = 15
foreign_total_usd = receiver_amount_usd + foreign_fee_usd
total_ngn_debit = foreign_total_usd * marked_rate_ngn_per_usd
platform_fx_margin_ngn = receiver_amount_usd * 20
platform_fee_margin_ngn = (15 - 10) * marked_rate_ngn_per_usd
```

### 5.6 CNY Supplier Payout

User enters the amount the receiver must get in CNY. Backend quotes the NGN cost including FX markup and processing fee.

Required CNY beneficiary fields depend on receiver type:

- Receiver type: `individual` or `business`
- Chinese-character legal name and/or exact Pinyin mapping
- Bank name
- Bank code/CNAPS code when using bank rails
- UnionPay card number when using card rails
- Province/city/branch details when required
- Optional invoice/reference metadata

CNY fee rules:

- Lync base outbound cost: `¥70`.
- TRANSFA user-facing processing fee: `¥105`.
- Platform profit on fee: `¥35`.
- TRANSFA FX markup: `+20 NGN` over Lync wholesale NGN/CNY rate.

Quote formula:

```text
marked_rate_ngn_per_cny = lync_wholesale_rate_ngn_per_cny + 20
foreign_fee_cny = 105
foreign_total_cny = receiver_amount_cny + foreign_fee_cny
total_ngn_debit = foreign_total_cny * marked_rate_ngn_per_cny
platform_fx_margin_ngn = receiver_amount_cny * 20
platform_fee_margin_ngn = (105 - 70) * marked_rate_ngn_per_cny
```

### 5.7 Dollar Transfer Screens

Figma includes a `Dollar Today`, `Transfa Dollar`, `Pay Sheet - Send Dollars`, `Pay Sheet - Dollar Account Found`, `Pay Sheet - Convert Currency`, and `Summary Notes` flow.

Backend interpretation:

- Treat Dollar screens as USD payout/quote views backed by NGN wallet debit.
- Do not create a user USD wallet for MVP unless product leadership changes the core rule.
- The API may return display amounts in USD for transaction presentation, but ledger entries remain NGN.
- The quote response must include `display_currency`, `destination_currency`, `source_currency`, and `ledger_currency` so the Flutter client can show Dollar UX without confusing wallet accounting.
- `Summary Notes` should be generated from the persisted quote snapshot and include amount sent, receiver amount, fee, exchange rate, provider disclosure, and settlement timing note.

### 5.8 Bank Center

The design includes a Bank Center screen with suggestions and manual search across banks such as Chase, OPay, and FCMB.

Backend requirements:

- Provide bank directory search by country/currency/rail.
- Provide suggested banks based on destination currency, recent recipients, provider availability, and user context.
- Return bank metadata needed by the destination rail: bank code, routing format, SWIFT/BIC requirement, CNAPS/UnionPay requirement, local display name, and availability status.
- Mark unavailable banks so the client can show bank-unavailable errors before transfer confirmation where possible.

### 5.9 CashDrop

Figma positions CashDrop as a face/account discovery experience: "Your face is your account number" and "To receive, scan your face with another Transfa."

Backend requirements:

- CashDrop must resolve a scanned/recognized Transfa identity into a payable user or account token.
- The API must never expose raw biometric templates to the client.
- Face recognition/liveness processing should return only a short-lived payment intent or recipient token.
- CashDrop recipient tokens must expire quickly and be scoped to the initiating user/device/session.
- CashDrop transfers still require quote/fee calculation, balance validation, passcode/biometric confirmation, and ledger debit.

### 5.10 Wallet Utilities: Power, Internet, and Gift Cards

The wallet page includes Power, Internet, and Reeplay/gift-card utilities.

Power backend requirements:

- Validate meter number and electricity provider.
- Return meter owner, address, meter type, and provider before confirmation.
- Debit NGN wallet atomically.
- Purchase token through utility provider.
- Store and display token, address, device owner, status, fees, total, transaction ID, support/share metadata.
- Support address-verification use case when power purchase is used to verify residence.

Internet/mobile data backend requirements:

- Support MTN Nigeria plans in MVP based on Figma copy.
- Store carrier, phone number, data plan, price, validity, and purchase status.
- Debit NGN wallet and reconcile provider fulfillment.

Gift-card/Reeplay backend requirements:

- Return gift-card catalog, available denominations, currency, country, description, and availability.
- Purchase gift card from NGN wallet with quote/fee disclosure when gift value is foreign-currency denominated.
- Store gift-card code, redemption instructions, expiry date, card ID, fee, total, transaction ID, support/share metadata.
- Treat this module as a separate product rail from supplier payouts because fulfillment, refundability, and compliance differ.

### 5.11 Support and Notifications

Support backend requirements:

- Provide user-level support conversations.
- Provide transaction-scoped support threads from receipts and failed/pending transactions.
- Support message metadata: sender, text, attachment references, transaction reference, read status, created time.
- Allow support staff/admin responses and internal notes.

Notification backend requirements:

- Store in-app notifications for software updates, sent/received money, support replies, in-review transactions, and completed transfers.
- Support read/unread status.
- Support push payload generation for critical events.
- Link notifications to transaction/support/update entities where applicable.

## 6. Functional Requirements

### 6.1 Quote Management

Backend must expose quote creation and quote confirmation flows.

Quote creation:

- Input: destination currency, receiver amount, beneficiary type, optional beneficiary ID.
- Fetch Lync wholesale rate.
- Apply TRANSFA FX markup.
- Apply TRANSFA transfer fee markup.
- Return itemized quote to the client.
- Persist quote snapshot with expiry.

Quote response must include:

- Quote ID
- Destination currency
- Receiver amount
- Wholesale rate
- Marked-up customer rate
- Transfer fee in foreign currency
- Transfer fee in NGN
- Total NGN debit
- Quote expiry timestamp
- Disclosure metadata for UI

Quote confirmation:

- Validate quote exists, belongs to user, is unexpired, and is unused.
- Validate beneficiary fields for selected currency.
- Validate user KYC tier and transaction limits.
- Validate wallet balance.
- Require transaction PIN.
- Debit wallet atomically.
- Create transfer record.
- Submit payout request to Lync.
- Return transfer tracking status.

### 6.2 Wallet Ledger

The wallet must be ledger-first. Cached balances are allowed only if derived from immutable ledger entries.

Ledger requirements:

- Double-entry accounting for every credit/debit.
- Wallet balance cannot go negative.
- All monetary values stored in minor units or fixed precision decimal types.
- Each ledger entry must reference a transaction, user, wallet, currency, direction, amount, and reason.
- Ledger entries are append-only; corrections are reversal entries.

Minimum ledger accounts:

- User NGN wallet liability
- TRANSFA settlement/treasury account
- TRANSFA fee revenue account
- Provider clearing account
- Refund clearing account

### 6.3 Payout Orchestration

International payout lifecycle:

```text
quote_created
quote_confirmed
wallet_debited
payout_submitted
payout_processing
payout_completed
payout_failed
refund_pending
refund_completed
```

Backend must:

- Submit provider payout with idempotency key.
- Persist provider reference IDs.
- Process provider webhooks.
- Retry safe transient failures.
- Avoid duplicate wallet debits.
- Avoid duplicate refunds.
- Expose status to mobile app.

### 6.4 Refund Logic

Refunds must use the original transaction row.

Refund fields to persist at transfer creation:

- `original_receiver_amount_foreign`
- `original_transfer_fee_foreign`
- `original_customer_rate_ngn`
- `original_principal_ngn`
- `original_fee_ngn`
- `original_total_debit_ngn`
- `failure_attribution`
- `refund_amount_ngn`

Fault attribution:

- User fault: incorrect account details, invalid beneficiary, receiver rejection caused by user-provided data.
- Network/platform fault: provider outage, rail failure, liquidity failure, internal system error.

Refund rules:

- User fault: refund original NGN principal only; retain processing fee.
- Network/platform fault: refund original NGN principal plus original fee.
- Unknown fault: default to manual review before refund finalization.

### 6.5 Beneficiaries

Users should be able to save and reuse beneficiaries.

Beneficiary requirements:

- Currency-specific schema validation.
- Beneficiary ownership by user.
- Soft delete support.
- Verification status where provider supports validation.
- Mask sensitive account details in API responses.
- Audit changes to beneficiary details.

### 6.6 Notifications

Backend should publish events for:

- Wallet funded.
- Transfer submitted.
- Transfer processing.
- Transfer completed.
- Transfer failed.
- Refund issued.
- KYC status changed.
- Login from new device.

Notification channels:

- In-app notification feed.
- Push notification.
- Email/SMS for critical events where configured.

### 6.7 Admin and Operations

Admin capabilities:

- Search users, wallets, beneficiaries, transfers, quotes, and provider references.
- View transaction timeline.
- Manually mark transactions for review.
- Trigger approved refunds.
- View reconciliation mismatches.
- Manage user restrictions.
- View provider webhook payloads and processing status.

Admin actions must be permissioned and audited.

## 7. API Requirements

### 7.1 Auth APIs

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/verify-otp`
- `POST /auth/refresh`
- `POST /auth/logout`
- `POST /auth/pin/setup`
- `POST /auth/pin/verify`
- `POST /auth/password/reset/request`
- `POST /auth/password/reset/confirm`

### 7.2 User and KYC APIs

- `GET /me`
- `PATCH /me`
- `GET /kyc/status`
- `POST /kyc/start`
- `POST /kyc/submit`
- `GET /limits`

### 7.3 Wallet APIs

- `GET /wallet`
- `GET /wallet/transactions`
- `GET /wallet/transactions/:id`
- `GET /wallet/virtual-account`
- `POST /wallet/virtual-account`

### 7.4 Beneficiary APIs

- `POST /beneficiaries`
- `GET /beneficiaries`
- `GET /beneficiaries/:id`
- `PATCH /beneficiaries/:id`
- `DELETE /beneficiaries/:id`
- `POST /beneficiaries/validate`

### 7.5 Quote and Transfer APIs

- `POST /quotes`
- `GET /quotes/:id`
- `POST /transfers`
- `GET /transfers`
- `GET /transfers/:id`
- `POST /transfers/:id/cancel` where provider lifecycle supports cancellation.

### 7.6 Webhook APIs

- `POST /webhooks/lync/funding`
- `POST /webhooks/lync/transfers`
- `POST /webhooks/lync/rates`

Webhook requirements:

- Signature verification.
- Timestamp tolerance.
- Replay protection.
- Idempotency by provider event ID.
- Raw body retention for audit.
- Dead-letter handling for failed processing.

## 8. Data Model

### 8.1 Core Tables

`users`

- `id`
- `email`
- `phone`
- `password_hash`
- `status`
- `kyc_tier`
- `created_at`
- `updated_at`

`user_profiles`

- `user_id`
- `first_name`
- `last_name`
- `date_of_birth`
- `address`
- `bvn_hash`
- `nin_hash`

`wallets`

- `id`
- `user_id`
- `currency` = `NGN`
- `available_balance`
- `ledger_balance`
- `status`

`ledger_entries`

- `id`
- `transaction_id`
- `wallet_id`
- `account_type`
- `currency`
- `direction`
- `amount`
- `balance_after`
- `reason`
- `created_at`

`virtual_accounts`

- `id`
- `user_id`
- `provider`
- `provider_customer_id`
- `account_number`
- `bank_name`
- `account_name`
- `status`

`beneficiaries`

- `id`
- `user_id`
- `destination_currency`
- `receiver_type`
- `display_name`
- `details_encrypted`
- `status`
- `created_at`
- `updated_at`

`fx_quotes`

- `id`
- `user_id`
- `destination_currency`
- `receiver_amount_foreign`
- `provider_wholesale_rate_ngn`
- `customer_rate_ngn`
- `fx_markup_ngn`
- `provider_fee_foreign`
- `customer_fee_foreign`
- `fee_ngn`
- `principal_ngn`
- `total_ngn`
- `expires_at`
- `status`

`transfers`

- `id`
- `user_id`
- `quote_id`
- `beneficiary_id`
- `type`
- `source_currency`
- `destination_currency`
- `receiver_amount_foreign`
- `principal_ngn`
- `fee_ngn`
- `total_debit_ngn`
- `status`
- `provider`
- `provider_reference`
- `idempotency_key`
- `failure_reason`
- `failure_attribution`
- `created_at`
- `updated_at`

`refunds`

- `id`
- `transfer_id`
- `user_id`
- `refund_amount_ngn`
- `refund_policy`
- `status`
- `approved_by`
- `created_at`
- `completed_at`

`provider_events`

- `id`
- `provider`
- `event_id`
- `event_type`
- `payload`
- `signature_valid`
- `processed_at`
- `processing_status`

`audit_logs`

- `id`
- `actor_type`
- `actor_id`
- `action`
- `entity_type`
- `entity_id`
- `metadata`
- `created_at`

### 8.2 Screen-Derived Supporting Tables

`support_threads`

- `id`
- `user_id`
- `transaction_id`
- `status`
- `subject`
- `created_at`
- `updated_at`

`support_messages`

- `id`
- `thread_id`
- `sender_type`
- `sender_id`
- `body`
- `attachments`
- `read_at`
- `created_at`

`notifications`

- `id`
- `user_id`
- `type`
- `title`
- `body`
- `entity_type`
- `entity_id`
- `read_at`
- `created_at`

`bank_directory`

- `id`
- `country`
- `currency`
- `rail`
- `name`
- `code`
- `swift_bic`
- `metadata`
- `availability_status`

`utility_products`

- `id`
- `type`
- `provider`
- `name`
- `amount`
- `currency`
- `metadata`
- `status`

`utility_transactions`

- `id`
- `user_id`
- `product_id`
- `wallet_transaction_id`
- `provider_reference`
- `beneficiary_identifier`
- `fulfillment_payload`
- `status`
- `created_at`

`gift_card_products`

- `id`
- `brand`
- `country`
- `value_currency`
- `min_value`
- `max_value`
- `fixed_value`
- `description`
- `status`

`gift_card_orders`

- `id`
- `user_id`
- `product_id`
- `wallet_transaction_id`
- `card_value`
- `card_currency`
- `fee_ngn`
- `total_ngn`
- `provider_reference`
- `redemption_code_encrypted`
- `redemption_url`
- `expires_at`
- `status`

`cashdrop_sessions`

- `id`
- `initiator_user_id`
- `recipient_user_id`
- `recipient_token_hash`
- `expires_at`
- `status`
- `created_at`

## 9. Security Requirements

- JWT access tokens with short TTL.
- Refresh token rotation and reuse detection.
- Device/session tracking.
- Transaction PIN for wallet debits and beneficiary creation or modification.
- Rate limiting with Redis for auth, OTP, quote creation, and transfer confirmation.
- Encrypt sensitive beneficiary details at rest.
- Hash BVN/NIN or store tokenized references where possible.
- Use TLS-only provider communication.
- Store provider API keys in environment/secret manager only.
- Enforce RBAC for admin APIs.
- Log security-sensitive actions.
- Never return full account numbers unless explicitly required; default to masked values.

## 10. Compliance and Risk Requirements

- KYC gating before wallet funding and transfers.
- Transaction limits by KYC tier, destination currency, and risk profile.
- Suspicious velocity checks.
- Duplicate beneficiary/transfer risk checks.
- Sanctions/PEP screening where provider or compliance vendor supports it.
- Manual review queue for large, unusual, failed, or ambiguous transactions.
- Retain audit logs and transaction records according to regulatory policy.

## 11. Provider Integration Requirements

Lync Global integration must support:

- Customer or wallet provisioning.
- Dedicated NGN virtual account creation.
- Funding webhook events.
- NGN local transfers.
- FX/rate retrieval for USD and CNY.
- International payout creation.
- Payout status webhooks.
- Provider balance/treasury reporting if available.
- Stablecoin routing hidden from users.

Provider abstraction:

- Implement a `PaymentsProvider` interface so Lync-specific logic is isolated.
- Persist provider request/response references.
- Wrap external calls with timeouts, retries, circuit breakers, and structured error mapping.

## 12. Non-Functional Requirements

Performance:

- Quote creation p95 below 1.5 seconds excluding provider outage.
- Wallet balance reads p95 below 300ms.
- Transfer confirmation p95 below 2 seconds before provider processing handoff.

Reliability:

- No duplicate debits under retry.
- No duplicate refunds under webhook replay.
- Webhook processing must be idempotent.
- Background jobs must retry transient provider failures.

Availability:

- Core wallet and transfer APIs target 99.9% uptime.
- Provider outages should degrade gracefully with user-facing status messages.

Observability:

- Structured logs with correlation IDs.
- Metrics for quotes, transfers, failures, refunds, provider latency, webhook failures, and reconciliation mismatches.
- Alerting on provider webhook failure, stuck transfers, negative balance attempts, and reconciliation differences.

## 13. Suggested NestJS Module Architecture

- `AuthModule`
- `UsersModule`
- `KycModule`
- `WalletsModule`
- `LedgerModule`
- `VirtualAccountsModule`
- `BeneficiariesModule`
- `FxModule`
- `QuotesModule`
- `TransfersModule`
- `PaymentsProvidersModule`
- `WebhooksModule`
- `NotificationsModule`
- `SupportModule`
- `BankDirectoryModule`
- `CashDropModule`
- `UtilitiesModule`
- `GiftCardsModule`
- `AdminModule`
- `RiskModule`
- `ReconciliationModule`
- `AuditModule`

Infrastructure:

- PostgreSQL for source-of-truth transactional data.
- Prisma for schema management, migrations, type-safe database access, and transaction boundaries.
- Redis for sessions, rate limits, idempotency locks, queues, and short-lived quote caches.
- Docker for reproducible local services and deployment packaging.
- Swagger/OpenAPI for generated API documentation and request/response contract visibility.
- Background queue for provider calls, webhooks, notifications, and reconciliation.

## 14. Key Backend State Machines

### 14.1 Quote Status

```text
created -> expired
created -> confirmed
confirmed -> consumed
confirmed -> cancelled
```

### 14.2 Transfer Status

```text
created
wallet_debited
provider_submitted
processing
completed
failed
refund_pending
refunded
manual_review
```

### 14.3 Wallet Transaction Status

```text
pending
posted
reversed
failed
```

## 15. Acceptance Criteria

- A user can create an account, verify identity, and receive a dedicated NGN virtual account.
- A funding webhook credits the user's NGN wallet exactly once.
- A user can request a USD quote and see NGN principal, fee, rate, and total debit.
- A user can request a CNY quote and see NGN principal, fee, rate, and total debit.
- Dollar transfer screens can display USD values while the backend records NGN wallet debits and NGN ledger entries.
- Confirming a valid quote debits only the NGN wallet.
- Confirming the same quote twice cannot debit the wallet twice.
- Provider webhook completion marks a transfer completed.
- Provider webhook failure triggers the correct refund workflow.
- User-fault payout failure refunds only original NGN principal.
- Platform/network-fault payout failure refunds original NGN principal plus original fee.
- Refunds never use live FX rates.
- Local NGN transfer lookup handles multiple banks for one account number and multiple accounts for one recipient.
- Power purchase returns a token and receipt after successful fulfillment.
- Mobile data purchase stores carrier, phone, plan, amount, and fulfillment status.
- Gift-card purchase stores redemption details securely and returns masked/shareable receipt metadata.
- Users can open transaction-scoped support threads from receipts.
- Notifications are persisted and can be marked read.
- Admins can inspect transfer timeline, provider references, webhook payloads, and refund decisions.

## 16. Open Questions

- Exact Lync API endpoints, authentication method, webhook signature format, and sandbox behavior.
- Whether Lync provides real-time beneficiary validation for USD and CNY rails.
- Required KYC/compliance provider for Nigerian users.
- Exact transfer limits by KYC tier.
- Whether stablecoin settlement requires internal treasury rebalancing jobs or is fully abstracted by Lync.
- Whether CNY business recipients and individual recipients use separate provider products.
- Whether the visible Dollar history is only a display mode or a future USD wallet feature. Current PRD preserves NGN-only wallet behavior.
- Whether Power, Internet, Reeplay/gift-card, and CashDrop are MVP features or post-MVP modules.
- Utility and gift-card provider choices, fees, reversal rules, and settlement SLAs.
- Biometric/CashDrop vendor, biometric storage boundaries, and explicit consent wording.
- Whether legal copy naming Flutterwave/IDME should remain if Lync Global is the selected fintech provider.
- Final admin dashboard scope for MVP.
- Final notification channels for MVP.
- Regulatory entity and licensing assumptions for wallet custody and international payouts.

## 17. MVP Scope Recommendation

MVP should include:

- Auth, user profile, PIN, JWT sessions.
- Basic KYC status and tier enforcement.
- NGN wallet ledger.
- Dedicated virtual account funding.
- USD and CNY quote generation.
- Saved beneficiaries.
- Quote confirmation and transfer creation.
- Lync payout submission.
- Webhook processing.
- Refund workflow.
- Transaction history.
- Bank Center search and recipient resolution.
- Receipts with share/support metadata.
- In-app notifications.
- Basic transaction-scoped support.
- Minimal admin operations dashboard/API.
- Reconciliation reports.

Defer:

- Multi-provider routing.
- Advanced treasury optimization.
- Business team accounts.
- Bulk payouts.
- In-app disputes beyond basic support thread creation.
- Card funding.
- Public merchant API.
- CashDrop biometric recipient discovery unless vendor/compliance scope is finalized.
- Power, mobile data, and gift-card fulfillment unless these are confirmed for MVP.

## 18. Figma Review Notes

Reviewed Figma file `8bBm347svehx0wfB1zZFYl`, page `Transfa 1`, node `0:1`, on May 27, 2026.

Important screen groups reviewed:

- Onboarding: `Welcome to Transfa`, `WELCOME STORIES`, `Add Phone & Email`, `Verify Your Startkey`.
- Identity and limits: `Verify Your NIN`, `Add Your BVN`, `Verify Your BVN`, `Add Your Photo ID`, `FACE SHOT`, `Photo ID Guide`, `Money Limits`.
- Security: `New Transfa Passcode`, `Confirm Your Transfa Passcode`, `Sign in with Passcode`, `Security Lockout Warning`, `Forgot Passcode`, `SECURITY`.
- Wallet and home: `HOME`, `WALLET`, `Add to Wallet`, `View Balance`.
- Local transfer: `Naira Today`, `Naira Keypad`, `Pay Sheet - Send Naira`, account-found/multiple-bank sheets, receipts, insufficient-money and unavailable-bank states.
- Dollar transfer: `Dollar Today`, `Transfa Dollar`, `Pay Sheet - Send Dollars`, `Pay Sheet - Dollar Account Found`, `Pay Sheet - Convert Currency`, `Summary Notes`, `What is the SWIFT Code?`.
- Operations: `Bank Center`, `Transfa Support`, `NOTIFICATION CENTER`.
- Adjacent products: `CashDrop`, `CashDrop Camera`, `Internet`, `Pay Sheet - Get Power`, `Power Receipt`, `Get Gift Card`, `GIFT RECEIPT`, `Reeplay Gift Cards`.
