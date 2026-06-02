import { Injectable } from "@nestjs/common";
import { createHash } from "crypto";
import { CreateDvaInput, CreateDvaResult, DvaProviderService, VerifyFundingResult } from "./dva-provider.interface";

@Injectable()
export class MockDvaProvider implements DvaProviderService {
  async createDedicatedVirtualAccount(input: CreateDvaInput): Promise<CreateDvaResult> {
    const hash = createHash("sha256").update(input.userId).digest("hex");
    const accountNumber = `7${hash.replace(/\D/g, "").padEnd(9, "0").slice(0, 9)}`;
    const firstName = input.firstName || "TRANSFA";
    const lastName = input.lastName || "USER";
    return {
      bankName: "Wema Bank",
      accountNumber,
      accountName: `TransFa ${firstName} ${lastName}`.toUpperCase(),
      provider: "mock_lync",
      providerReference: `mock_dva_${hash.slice(0, 12)}`,
      status: "active",
      raw: { preferredBank: input.preferredBank || "auto" }
    };
  }

  async verifyFunding(reference: string): Promise<VerifyFundingResult> {
    return {
      reference,
      amount: 50000,
      currency: "NGN",
      status: "successful",
      provider: "mock_lync",
      providerReference: `mock_funding_${reference}`,
      raw: { mocked: true }
    };
  }
}
