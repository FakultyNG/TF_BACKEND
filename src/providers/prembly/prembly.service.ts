import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { AxiosError, AxiosInstance } from "axios";
import { ApiException } from "../../common/errors/api.exception";
import { BvnVerificationResult, KycProvider, SelfieValidationResult } from "../interfaces/kyc-provider.interface";
import { mapPremblyBvnResponse, mapPremblyBvnWithFaceResponse, mapPremblyStatusResponse } from "./prembly.mapper";

@Injectable()
export class PremblyKycProvider implements KycProvider {
  private readonly logger = new Logger(PremblyKycProvider.name);
  private readonly http: AxiosInstance;

  constructor(private readonly config: ConfigService) {
    this.http = axios.create({
      baseURL: this.config.get<string>("PREMBLY_BASE_URL", "https://api.prembly.com"),
      timeout: Number(this.config.get<string>("PREMBLY_TIMEOUT_MS", "15000")),
      headers: this.headers()
    });
  }

  async verifyBvn(bvn: string): Promise<BvnVerificationResult> {
    const data = await this.request("post", this.config.get<string>("PREMBLY_BVN_ADVANCE_PATH", "/verification/bvn"), {
      number: bvn
    });
    return mapPremblyBvnResponse(data, bvn);
  }

  async verifyBvnWithSelfie(bvn: string, selfieImageBase64: string): Promise<SelfieValidationResult> {
    const data = await this.request("post", this.config.get<string>("PREMBLY_BVN_FACE_PATH", "/verification/bvn_w_face"), {
      number: bvn,
      image: stripDataUrlPrefix(selfieImageBase64)
    });
    return mapPremblyBvnWithFaceResponse(data, bvn, Number(this.config.get<string>("KYC_FACE_MATCH_THRESHOLD", "95")));
  }

  async getVerificationStatus(providerReference: string): Promise<BvnVerificationResult> {
    const template = this.config.get<string>("PREMBLY_STATUS_PATH", "/verification/:id/status");
    const path = template.replace(":id", encodeURIComponent(providerReference));
    const method = this.config.get<string>("PREMBLY_STATUS_METHOD", "get").toLowerCase() === "post" ? "post" : "get";
    const data = await this.request(method, path);
    return mapPremblyStatusResponse(data, providerReference);
  }

  private headers() {
    const apiKey = this.config.get<string>("PREMBLY_API_KEY") || this.config.get<string>("PREMBLY_SECRET_KEY");
    const appId = this.config.get<string>("PREMBLY_APP_ID");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      accept: "application/json"
    };
    if (apiKey) headers["x-api-key"] = apiKey;
    if (appId) headers["app-id"] = appId;
    return headers;
  }

  private async request(method: "get" | "post", url: string, data?: unknown) {
    try {
      const response = await this.http.request({ method, url, data });
      return response.data;
    } catch (error) {
      const message = providerMessage(error);
      this.logger.warn({ provider: "prembly", url, method, message });
      throw new ApiException("KYC provider request failed", "KYC_PROVIDER_ERROR", HttpStatus.BAD_GATEWAY);
    }
  }
}

function stripDataUrlPrefix(value: string) {
  return value.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
}

function providerMessage(error: unknown) {
  if (!axios.isAxiosError(error)) return error instanceof Error ? error.message : "Prembly request failed";
  const axiosError = error as AxiosError<{ message?: string; detail?: string; error?: string }>;
  return axiosError.response?.data?.message || axiosError.response?.data?.detail || axiosError.response?.data?.error || axiosError.message;
}
