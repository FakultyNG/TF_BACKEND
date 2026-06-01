# Postman-ready cURL Examples

Base URL:

```bash
BASE_URL=http://localhost:4000/api/v1
```

## 1. Send OTP

```bash
curl -X POST "$BASE_URL/auth/otp/send" \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"08103100000"}'
```

## 2. Resend OTP

```bash
curl -X POST "$BASE_URL/auth/otp/resend" \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"08103100000","otpReference":"otp_ref_12345"}'
```

## 3. Validate OTP

```bash
curl -X POST "$BASE_URL/auth/otp/validate" \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"08103100000","otp":"123456","otpReference":"otp_ref_12345"}'
```

## 4. Start Registration

```bash
curl -X POST "$BASE_URL/auth/register/start" \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"08103100000"}'
```

## 5. Complete Registration

```bash
curl -X POST "$BASE_URL/auth/register/complete" \
  -H "Content-Type: application/json" \
  -d '{"registrationToken":"reg_temp_12345","passcode":"12345"}'
```

## 6. Verify BVN

```bash
curl -X POST "$BASE_URL/kyc/bvn/verify" \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"bvn":"12345678901"}'
```

## 7. Validate BVN With Selfie

```bash
curl -X POST "$BASE_URL/kyc/bvn/selfie-validate" \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"kycReference":"kyc_ref_12345","selfieImageBase64":"data:image/jpeg;base64,/9j/4AAQSkZJRgABAgAAAQABAAD..."}'
```

## 8. Get KYC Status

```bash
curl -X GET "$BASE_URL/kyc/status" \
  -H "Authorization: Bearer ACCESS_TOKEN"
```

## 9. Login

```bash
curl -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"08103100000","passcode":"12345"}'
```

## 10. Refresh Token

```bash
curl -X POST "$BASE_URL/auth/refresh-token" \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"REFRESH_TOKEN"}'
```

## 11. Logout

```bash
curl -X POST "$BASE_URL/auth/logout" \
  -H "Authorization: Bearer ACCESS_TOKEN"
```

## 12. Change Passcode

```bash
curl -X PATCH "$BASE_URL/auth/passcode/change" \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"oldPasscode":"12345","newPasscode":"54321"}'
```

## 13. Request Passcode Reset OTP

```bash
curl -X POST "$BASE_URL/auth/passcode/reset/request" \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"08103100000"}'
```

## 14. Verify Passcode Reset OTP

```bash
curl -X POST "$BASE_URL/auth/passcode/reset/verify" \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"08103100000","otp":"123456","otpReference":"otp_ref_x7ab92"}'
```

## 15. Complete Passcode Reset

```bash
curl -X POST "$BASE_URL/auth/passcode/reset/complete" \
  -H "Content-Type: application/json" \
  -d '{"resetToken":"reset_temp_12345","newPasscode":"54321"}'
```

## Admin Login

```bash
curl -X POST "$BASE_URL/admin/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"2348000000000","passcode":"12345"}'
```
