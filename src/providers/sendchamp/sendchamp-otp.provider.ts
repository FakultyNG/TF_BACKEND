import { HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { AxiosInstance } from "axios";
import { ApiException } from "../../common/errors/api.exception";
import { ConfirmOtpInput, OtpConfirmResult, OtpProvider, OtpSendResult, SendOtpInput } from "../interfaces/otp-provider.interface";

@Injectable()
export class SendchampOtpProvider implements OtpProvider {
  private readonly client: AxiosInstance;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>("SENDCHAMP_API_KEY", "");
    this.client = axios.create({
      baseURL: this.config.get<string>("SENDCHAMP_BASE_URL", "https://api.sendchamp.com/api/v1"),
      timeout: Number(this.config.get<number>("SENDCHAMP_TIMEOUT_MS", 15000)),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      }
    });
  }

  async sendOtp(input: SendOtpInput): Promise<OtpSendResult> {
    this.ensureConfigured();

    try {
      const response = await this.client.request({
        method: "POST",
        url: "/verification/create",
        data: {
          channel: this.config.get<string>("SENDCHAMP_OTP_CHANNEL", "sms"),
          sender: this.config.get<string>("SENDCHAMP_OTP_SENDER", "Transfa"),
          token_type: this.config.get<string>("SENDCHAMP_OTP_TOKEN_TYPE", "numeric"),
          token_length: Number(this.config.get<number>("SENDCHAMP_OTP_TOKEN_LENGTH", 6)),
          expiration_time: Number(this.config.get<number>("SENDCHAMP_OTP_EXPIRATION_MINUTES", 10)),
          customer_mobile_number: input.phoneNumber
        }
      });

      return {
        provider: "sendchamp",
        providerReference: this.extractReference(response.data, input.otpReference),
        status: this.extractStatus(response.data)
      };
    } catch (error) {
      this.logProviderError("Sendchamp OTP create failed", error);
      throw new ApiException("OTP could not be sent", "OTP_SEND_FAILED", HttpStatus.BAD_GATEWAY);
    }
  }

  async confirmOtp(input: ConfirmOtpInput): Promise<OtpConfirmResult> {
    this.ensureConfigured();

    try {
      const response = await this.client.request({
        method: "POST",
        url: "/verification/confirm",
        data: {
          verification_reference: input.providerReference,
          verification_code: input.otp
        }
      });
      const status = this.extractStatus(response.data);

      return {
        provider: "sendchamp",
        verified: this.isConfirmed(response.data, status),
        status
      };
    } catch (error) {
      if (axios.isAxiosError(error) && [400, 422].includes(error.response?.status ?? 0)) {
        return {
          provider: "sendchamp",
          verified: false,
          status: "invalid"
        };
      }
      this.logProviderError("Sendchamp OTP confirm failed", error);
      throw new ApiException("OTP verification failed", "OTP_VERIFICATION_FAILED", HttpStatus.BAD_GATEWAY);
    }
  }

  private ensureConfigured() {
    if (!this.config.get<string>("SENDCHAMP_API_KEY")) {
      throw new ApiException("OTP provider is unavailable", "OTP_PROVIDER_UNAVAILABLE", HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  private extractReference(payload: unknown, fallback: string): string {
    const data = this.asRecord(payload);
    const nested = this.asRecord(data.data);
    const candidates = [
      nested.reference,
      nested.verification_reference,
      nested.verificationReference,
      nested.id,
      data.reference,
      data.verification_reference,
      data.verificationReference,
      data.id
    ];
    const reference = candidates.find((value): value is string => typeof value === "string" && value.length > 0);
    return reference ?? fallback;
  }

  private extractStatus(payload: unknown): string | undefined {
    const data = this.asRecord(payload);
    const nested = this.asRecord(data.data);
    const value = nested.status ?? nested.verification_status ?? data.status ?? data.message;
    return typeof value === "string" ? value : undefined;
  }

  private isConfirmed(payload: unknown, status?: string): boolean {
    const data = this.asRecord(payload);
    const nested = this.asRecord(data.data);
    const success = nested.verified ?? nested.is_verified ?? nested.success ?? data.verified ?? data.success;
    if (success === true) return true;
    const normalizedStatus = status?.toLowerCase();
    return ["confirmed", "verified", "success", "successful", "approved"].includes(normalizedStatus ?? "");
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  }

  private logProviderError(message: string, error: unknown) {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    console.error(JSON.stringify({ message, status }));
  }
}
