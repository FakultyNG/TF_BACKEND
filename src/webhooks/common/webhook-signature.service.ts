import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, timingSafeEqual } from "crypto";
import { IncomingHttpHeaders } from "http";

@Injectable()
export class WebhookSignatureService {
  constructor(private readonly config: ConfigService) {}

  verify(payload: unknown, headers: IncomingHttpHeaders, secret?: string) {
    if (!secret) return true;
    const signature = this.findSignature(headers);
    if (!signature) return false;
    const expected = createHmac("sha256", secret).update(JSON.stringify(payload ?? {})).digest("hex");
    return this.safeEqual(this.normalize(signature), expected);
  }

  secret(envKey: string) {
    return this.config.get<string>(envKey);
  }

  private findSignature(headers: IncomingHttpHeaders) {
    const keys = [
      "x-signature",
      "x-webhook-signature",
      "x-lync-signature",
      "x-dojah-signature",
      "x-prembly-signature",
      "x-payout-signature",
      "x-reeplay-signature"
    ];
    for (const key of keys) {
      const value = headers[key];
      if (Array.isArray(value)) return value[0];
      if (value) return value;
    }
    return undefined;
  }

  private normalize(signature: string) {
    return signature.trim().replace(/^sha256=/i, "");
  }

  private safeEqual(left: string, right: string) {
    try {
      const leftBuffer = Buffer.from(left, "hex");
      const rightBuffer = Buffer.from(right, "hex");
      return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
    } catch {
      return false;
    }
  }
}
