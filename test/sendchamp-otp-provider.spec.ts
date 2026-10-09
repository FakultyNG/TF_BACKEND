import axios from "axios";
import { ConfigService } from "@nestjs/config";
import { ApiException } from "../src/common/errors/api.exception";
import { MockOtpProvider } from "../src/providers/adapters/mock-otp.provider";
import { otpProviderFactory } from "../src/providers/providers.module";
import { SendchampOtpProvider } from "../src/providers/sendchamp/sendchamp-otp.provider";

jest.mock("axios");

describe("SendchampOtpProvider", () => {
  const request = jest.fn();

  const config = {
    get: jest.fn((key: string, fallback?: unknown) => {
      const values: Record<string, unknown> = {
        SENDCHAMP_BASE_URL: "https://api.sendchamp.com/api/v1",
        SENDCHAMP_API_KEY: "sendchamp_secret",
        SENDCHAMP_OTP_CHANNEL: "sms",
        SENDCHAMP_OTP_SENDER: "Transfa",
        SENDCHAMP_OTP_TOKEN_TYPE: "numeric",
        SENDCHAMP_OTP_TOKEN_LENGTH: 6,
        SENDCHAMP_OTP_EXPIRATION_MINUTES: 10
      };
      return values[key] ?? fallback;
    })
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    (axios.create as jest.Mock).mockReturnValue({ request });
    (axios.isAxiosError as unknown as jest.Mock).mockImplementation((error) => Boolean(error?.isAxiosError));
  });

  it("creates a Sendchamp SMS verification with the Transfa OTP settings", async () => {
    request.mockResolvedValueOnce({
      data: {
        data: {
          reference: "sendchamp_ref_123"
        }
      }
    });

    const provider = new SendchampOtpProvider(config);

    const result = await provider.sendOtp({
      otpReference: "otp_ref_123",
      phoneNumber: "2348103100000",
      purpose: "registration"
    });

    expect(request).toHaveBeenCalledWith({
      method: "POST",
      url: "/verification/create",
      data: {
        channel: "sms",
        sender: "Transfa",
        token_type: "numeric",
        token_length: 6,
        expiration_time: 10,
        customer_mobile_number: "2348103100000",
        meta_data: {
          otp_reference: "otp_ref_123",
          purpose: "registration"
        }
      }
    });
    expect(result).toEqual({
      provider: "sendchamp",
      providerReference: "sendchamp_ref_123",
      status: undefined
    });
  });

  it("confirms a Sendchamp verification using provider reference and token", async () => {
    request.mockResolvedValueOnce({
      data: {
        code: 200,
        data: {
          reference: "sendchamp_ref_123",
          status: "sent"
        },
        message: "Confirm verification",
        status: "success"
      }
    });

    const provider = new SendchampOtpProvider(config);

    const result = await provider.confirmOtp({
      otpReference: "otp_ref_123",
      phoneNumber: "2348103100000",
      purpose: "registration",
      providerReference: "sendchamp_ref_123",
      otp: "123456"
    });

    expect(request).toHaveBeenCalledWith({
      method: "POST",
      url: "/verification/confirm",
      data: {
        verification_reference: "sendchamp_ref_123",
        verification_code: "123456"
      }
    });
    expect(result).toEqual({
      provider: "sendchamp",
      verified: true,
      status: "success"
    });
  });

  it("treats Sendchamp invalid-token responses as failed confirmations", async () => {
    request.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 422 }
    });

    const provider = new SendchampOtpProvider(config);

    await expect(
      provider.confirmOtp({
        otpReference: "otp_ref_123",
        phoneNumber: "2348103100000",
        purpose: "registration",
        providerReference: "sendchamp_ref_123",
        otp: "000000"
      })
    ).resolves.toEqual({
      provider: "sendchamp",
      verified: false,
      status: "invalid"
    });
  });

  it("maps provider send failures to OTP_SEND_FAILED without exposing provider secrets", async () => {
    request.mockRejectedValueOnce(new Error("provider down"));
    const provider = new SendchampOtpProvider(config);

    await expect(
      provider.sendOtp({
        otpReference: "otp_ref_123",
        phoneNumber: "2348103100000",
        purpose: "registration"
      })
    ).rejects.toMatchObject({ code: "OTP_SEND_FAILED" });
  });
});

describe("OTP provider configuration", () => {
  const sendchamp = {} as SendchampOtpProvider;
  const mock = {} as MockOtpProvider;

  const config = (values: Record<string, string>) =>
    ({
      get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback)
    }) as unknown as ConfigService;

  it("uses the mock provider only when OTP development mode is enabled", () => {
    expect(otpProviderFactory(config({ OTP_DEV_MODE: "true" }), sendchamp, mock)).toBe(mock);
  });

  it("uses Sendchamp when the live provider and key are configured", () => {
    expect(
      otpProviderFactory(
        config({ OTP_DEV_MODE: "false", OTP_PROVIDER: "sendchamp", SENDCHAMP_API_KEY: "live_key" }),
        sendchamp,
        mock
      )
    ).toBe(sendchamp);
  });

  it("rejects a silent mock fallback outside OTP development mode", () => {
    expect(() => otpProviderFactory(config({ OTP_DEV_MODE: "false" }), sendchamp, mock)).toThrow(
      "OTP_PROVIDER must be set to sendchamp"
    );
  });

  it("rejects Sendchamp configuration without an API key", () => {
    expect(() =>
      otpProviderFactory(config({ OTP_DEV_MODE: "false", OTP_PROVIDER: "sendchamp" }), sendchamp, mock)
    ).toThrow("SENDCHAMP_API_KEY is required");
  });
});
