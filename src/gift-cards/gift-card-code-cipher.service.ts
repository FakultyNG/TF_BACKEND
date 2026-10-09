import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

@Injectable()
export class GiftCardCodeCipher {
  private static readonly prefix = "v1";

  constructor(private readonly config: ConfigService) {}

  encrypt(value?: string) {
    if (!value) return undefined;
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key(), iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [
      GiftCardCodeCipher.prefix,
      iv.toString("base64url"),
      tag.toString("base64url"),
      encrypted.toString("base64url")
    ].join(":");
  }

  decrypt(value?: string | null) {
    if (!value) return undefined;
    if (!value.startsWith(`${GiftCardCodeCipher.prefix}:`)) return value;
    const [, iv, tag, encrypted] = value.split(":");
    if (!iv || !tag || !encrypted) throw new Error("Invalid encrypted gift-card code");
    const decipher = createDecipheriv("aes-256-gcm", this.key(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encrypted, "base64url")),
      decipher.final()
    ]).toString("utf8");
  }

  mask(value?: string) {
    if (!value) return undefined;
    const visible = value.replace(/\s/g, "").slice(-4);
    return visible ? `****-****-${visible}` : undefined;
  }

  private key() {
    const secret = this.config.get<string>("GIFT_CARD_ENCRYPTION_KEY")?.trim();
    if (!secret || secret.length < 32) {
      throw new Error("GIFT_CARD_ENCRYPTION_KEY must contain at least 32 characters");
    }
    return createHash("sha256").update(secret).digest();
  }
}
