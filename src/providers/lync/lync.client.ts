import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { AxiosError, AxiosInstance, Method } from "axios";
import { getLyncConfig } from "./lync.config";
import { LyncConfigurationError, LyncProviderError } from "./lync.errors";
import { LyncConfig, LyncEndpointKey } from "./lync.types";

@Injectable()
export class LyncClient {
  private readonly logger = new Logger(LyncClient.name);
  private readonly config: LyncConfig;
  private readonly http: AxiosInstance;

  constructor(configService: ConfigService) {
    this.config = getLyncConfig(configService);
    this.http = axios.create({
      baseURL: this.config.baseUrl,
      timeout: this.config.timeoutMs,
      headers: this.authHeaders()
    });
  }

  get enabled() {
    return this.config.enabled;
  }

  async get(endpoint: LyncEndpointKey, pathParams?: Record<string, string>) {
    return this.request("GET", endpoint, undefined, pathParams, true);
  }

  async post(endpoint: LyncEndpointKey, payload: unknown, pathParams?: Record<string, string>) {
    return this.request("POST", endpoint, payload, pathParams, false);
  }

  private async request(
    method: Method,
    endpoint: LyncEndpointKey,
    payload?: unknown,
    pathParams?: Record<string, string>,
    retryable = false
  ) {
    const path = this.resolvePath(endpoint, pathParams);
    const attempts = retryable ? 3 : 1;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        this.logger.debug({
          provider: "lync",
          endpoint,
          method,
          attempt,
          payload: this.mask(payload)
        });
        const response = await this.http.request({ method, url: path, data: payload });
        return response.data;
      } catch (error) {
        const providerError = this.toProviderError(error);
        if (providerError instanceof LyncConfigurationError || !providerError.retryable || attempt === attempts) {
          throw providerError;
        }
      }
    }

    throw new LyncProviderError("Lync request failed");
  }

  private resolvePath(endpoint: LyncEndpointKey, pathParams?: Record<string, string>) {
    const path = this.config.paths[endpoint];
    if (!path) {
      throw new LyncConfigurationError(`Missing Lync endpoint path for ${endpoint}`);
    }

    return Object.entries(pathParams ?? {}).reduce(
      (current, [key, value]) => current.replace(new RegExp(`:${key}\\b`, "g"), encodeURIComponent(value)),
      path
    );
  }

  private authHeaders() {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Lync-Environment": this.config.env
    };

    if (this.config.apiKey) headers["x-waza-api-key"] = this.config.apiKey;
    if (this.config.secretKey) headers["X-Lync-Secret-Key"] = this.config.secretKey;
    if (this.config.clientId) headers["X-Lync-Client-Id"] = this.config.clientId;
    if (this.config.clientSecret) headers["X-Lync-Client-Secret"] = this.config.clientSecret;
    return headers;
  }

  private toProviderError(error: unknown) {
    if (error instanceof LyncConfigurationError) return error;
    if (!axios.isAxiosError(error)) {
      const message = error instanceof Error ? error.message : "Lync request failed";
      return new LyncProviderError(message);
    }

    const axiosError = error as AxiosError<{ message?: string; error?: string; code?: string }>;
    const status = axiosError.response?.status;
    const body = axiosError.response?.data;
    const message = body?.message || body?.error || axiosError.message || "Lync request failed";
    const retryable = Boolean(status && [408, 429, 500, 502, 503, 504].includes(status));

    this.logger.warn({
      provider: "lync",
      status,
      message,
      retryable,
      response: this.mask(body)
    });

    return new LyncProviderError(message, status, body?.code, retryable, this.mask(body));
  }

  private mask(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((item) => this.mask(item));
    if (!value || typeof value !== "object") return value;
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      output[key] = this.isSensitiveKey(key) ? "***MASKED***" : this.mask(child);
    }
    return output;
  }

  private isSensitiveKey(key: string) {
    const lower = key.toLowerCase();
    return ["authorization", "secret", "token", "key", "bvn", "nin", "password"].some((part) => lower.includes(part));
  }
}
