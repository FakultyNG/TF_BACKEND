import { Injectable } from "@nestjs/common";
import { createHash } from "crypto";
import sharp = require("sharp");

export interface CashDropFingerprint {
  fingerprint: string;
  fingerprintHash: string;
}

@Injectable()
export class CashDropFingerprintService {
  async fingerprintFromImageUrl(profileImageUrl: string): Promise<CashDropFingerprint> {
    const buffer = await this.fetchImage(profileImageUrl);
    return this.fingerprintFromBuffer(buffer);
  }

  async fingerprintFromBase64(base64Image: string): Promise<CashDropFingerprint> {
    const cleaned = base64Image.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
    return this.fingerprintFromBuffer(Buffer.from(cleaned, "base64"));
  }

  compare(first: string, second: string) {
    const length = Math.min(first.length, second.length);
    if (!length) return 0;
    let distance = Math.abs(first.length - second.length);
    for (let index = 0; index < length; index += 1) {
      if (first[index] !== second[index]) distance += 1;
    }
    return Number(((1 - distance / Math.max(first.length, second.length)) * 100).toFixed(1));
  }

  private async fetchImage(profileImageUrl: string) {
    if (profileImageUrl.startsWith("data:image/")) {
      const cleaned = profileImageUrl.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
      return Buffer.from(cleaned, "base64");
    }
    const response = await fetch(profileImageUrl);
    if (!response.ok) throw new Error("profile image fetch failed");
    return Buffer.from(await response.arrayBuffer());
  }

  private async fingerprintFromBuffer(buffer: Buffer): Promise<CashDropFingerprint> {
    const raw = await sharp(buffer)
      .rotate()
      .resize(16, 16, { fit: "fill" })
      .grayscale()
      .raw()
      .toBuffer();
    const average = raw.reduce((sum, value) => sum + value, 0) / raw.length;
    const fingerprint = Array.from(raw)
      .map((value) => (value >= average ? "1" : "0"))
      .join("");
    return {
      fingerprint,
      fingerprintHash: createHash("sha256").update(fingerprint).digest("hex")
    };
  }
}
