import { HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash } from "crypto";
import { ApiException } from "../../common/errors/api.exception";
import { CreateDvaInput, CreateDvaResult, DvaProviderService, VerifyFundingResult } from "../dva/dva-provider.interface";
import { FxPayoutProviderService, FxPayoutResult, FxQuoteResult } from "../fx-payout/fx-payout-provider.interface";
import { MOCK_BANKS } from "../transfers/mock-ngn-transfer.provider";
import {
  Bank,
  BankAccountSuggestion,
  NgnTransferProviderService,
  NgnTransferResult,
  ResolvedAccount
} from "../transfers/ngn-transfer-provider.interface";
import { LyncClient } from "./lync.client";
import { LyncMapper } from "./lync.mapper";

@Injectable()
export class LyncService implements DvaProviderService, NgnTransferProviderService, FxPayoutProviderService {
  private readonly mapper = new LyncMapper();

  constructor(
    private readonly client: LyncClient,
    private readonly config: ConfigService
  ) {}

  async createDedicatedVirtualAccount(input: CreateDvaInput): Promise<CreateDvaResult> {
    const raw = await this.client.post(
      "createDva",
      this.mapper.toCreateDvaPayload({
        ...input,
        internalReference: `dva_${input.userId}`
      })
    );
    return this.mapper.toDvaOutput(raw);
  }

  async verifyFunding(reference: string): Promise<VerifyFundingResult> {
    const raw = await this.client.get("verifyFunding", { reference });
    return { ...this.mapper.toFundingOutput(reference, raw), provider: "lync" };
  }

  async getBanks(): Promise<Bank[]> {
    const raw = await this.client.get("banks");
    const banks = this.mapper.toBanks(raw);
    return banks.length ? banks : MOCK_BANKS;
  }

  async suggestBanksByAccountNumber(accountNumber: string): Promise<BankAccountSuggestion[]> {
    try {
      const raw = await this.client.get("resolveAccount", { accountNumber });
      return this.mapper.toBankSuggestions(accountNumber, raw);
    } catch {
      return this.fallbackSuggestions(accountNumber);
    }
  }

  async resolveAccount(bankCode: string, accountNumber: string): Promise<ResolvedAccount> {
    const raw = await this.client.post("resolveAccount", { bankCode, accountNumber });
    const resolved = this.mapper.toResolvedAccount(bankCode, accountNumber, raw);
    if (!resolved.accountName) {
      throw new ApiException("Account could not be resolved", "ACCOUNT_RESOLVE_FAILED", HttpStatus.BAD_REQUEST);
    }
    return resolved;
  }

  async submitTransfer(input: {
    amount: number;
    accountNumber: string;
    bankCode: string;
    narration?: string;
    reference: string;
  }): Promise<NgnTransferResult> {
    const raw = await this.client.post("ngnTransfer", this.mapper.toNgnTransferPayload(input));
    return { ...this.mapper.toTransferOutput(raw), provider: "lync" };
  }

  async quote(input: { payoutCurrency: "USD" | "CNY"; amount: number }): Promise<FxQuoteResult> {
    const fallback = this.mockFxQuote(input);
    try {
      const raw = await this.client.post("fxQuote", this.mapper.toFxQuotePayload(input));
      return this.mapper.toFxQuote(input, fallback, raw);
    } catch {
      return fallback;
    }
  }

  async submitPayout(input: {
    reference: string;
    payoutCurrency: "USD" | "CNY";
    payoutAmount: number;
    beneficiary: unknown;
  }): Promise<FxPayoutResult> {
    const raw = await this.client.post("fxPayout", this.mapper.toFxPayoutPayload(input));
    return { ...this.mapper.toTransferOutput(raw), provider: "lync" };
  }

  async getPaymentReceipt(input: { providerReference: string }) {
    return this.client.get("receipt", { providerReference: input.providerReference });
  }

  private fallbackSuggestions(accountNumber: string): BankAccountSuggestion[] {
    const firstDigit = Number(accountNumber[0] ?? "0");
    const candidates = [0, 1, 2].map((offset) => MOCK_BANKS[(firstDigit + offset) % MOCK_BANKS.length]);
    return candidates.map((bank, index) => ({
      accountName: "JOHN DOE",
      accountNumber,
      bankCode: bank.code,
      bankName: bank.name,
      confidence: [95, 88, 80][index]
    }));
  }

  private mockFxQuote(input: { payoutCurrency: "USD" | "CNY"; amount: number }): FxQuoteResult {
    const fxRate = input.payoutCurrency === "USD"
      ? Number(this.config.get<string>("USD_MOCK_FX_RATE", "1650"))
      : Number(this.config.get<string>("CNY_MOCK_FX_RATE", "230"));
    const providerFee = input.payoutCurrency === "USD"
      ? Number(this.config.get<string>("USD_PROVIDER_FEE_NGN", "2500"))
      : Number(this.config.get<string>("CNY_PROVIDER_FEE_NGN", "3000"));
    const tfFee = input.payoutCurrency === "USD"
      ? Number(this.config.get<string>("USD_TF_FEE_NGN", "1500"))
      : Number(this.config.get<string>("CNY_TF_FEE_NGN", "2500"));
    return {
      payoutCurrency: input.payoutCurrency,
      payoutAmount: input.amount,
      fxRate,
      providerFee,
      tfFee,
      totalNgnDebit: input.amount * fxRate + providerFee + tfFee,
      estimatedSettlementTime: input.payoutCurrency === "USD"
        ? this.config.get<string>("USD_SETTLEMENT_TIME", "1-3 business days")
        : this.config.get<string>("CNY_SETTLEMENT_TIME", "1-3 business days")
    };
  }
}

@Injectable()
export class MockLyncProvider implements DvaProviderService, NgnTransferProviderService, FxPayoutProviderService {
  constructor(private readonly config: ConfigService) {}

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
      raw: { mocked: true, preferredBank: input.preferredBank || "auto" }
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

  async getBanks(): Promise<Bank[]> {
    return MOCK_BANKS;
  }

  async suggestBanksByAccountNumber(accountNumber: string): Promise<BankAccountSuggestion[]> {
    const firstDigit = Number(accountNumber[0] ?? "0");
    const candidates = [0, 1, 2].map((offset) => MOCK_BANKS[(firstDigit + offset) % MOCK_BANKS.length]);
    return candidates.map((bank, index) => ({
      accountName: "JOHN DOE",
      accountNumber,
      bankCode: bank.code,
      bankName: bank.name,
      confidence: [95, 88, 80][index]
    }));
  }

  async resolveAccount(bankCode: string, accountNumber: string): Promise<ResolvedAccount> {
    const bank = MOCK_BANKS.find((item) => item.code === bankCode) || MOCK_BANKS[0];
    return {
      accountName: "JOHN DOE",
      accountNumber,
      bankCode,
      bankName: bank.name
    };
  }

  async submitTransfer(input: { reference: string }): Promise<NgnTransferResult> {
    return {
      status: "processing",
      provider: "mock_lync",
      providerReference: `mock_ngn_${input.reference}`,
      raw: { mocked: true, submitted: true }
    };
  }

  async quote(input: { payoutCurrency: "USD" | "CNY"; amount: number }): Promise<FxQuoteResult> {
    const fxRate = input.payoutCurrency === "USD"
      ? Number(this.config.get<string>("USD_MOCK_FX_RATE", "1650"))
      : Number(this.config.get<string>("CNY_MOCK_FX_RATE", "230"));
    const providerFee = input.payoutCurrency === "USD"
      ? Number(this.config.get<string>("USD_PROVIDER_FEE_NGN", "2500"))
      : Number(this.config.get<string>("CNY_PROVIDER_FEE_NGN", "3000"));
    const tfFee = input.payoutCurrency === "USD"
      ? Number(this.config.get<string>("USD_TF_FEE_NGN", "1500"))
      : Number(this.config.get<string>("CNY_TF_FEE_NGN", "2500"));
    return {
      payoutCurrency: input.payoutCurrency,
      payoutAmount: input.amount,
      fxRate,
      providerFee,
      tfFee,
      totalNgnDebit: input.amount * fxRate + providerFee + tfFee,
      estimatedSettlementTime: input.payoutCurrency === "USD"
        ? this.config.get<string>("USD_SETTLEMENT_TIME", "1-3 business days")
        : this.config.get<string>("CNY_SETTLEMENT_TIME", "1-3 business days")
    };
  }

  async submitPayout(input: { reference: string; payoutCurrency: "USD" | "CNY" }): Promise<FxPayoutResult> {
    return {
      status: "processing",
      provider: "mock_lync",
      providerReference: `mock_${input.payoutCurrency.toLowerCase()}_${input.reference}`,
      raw: { mocked: true, submitted: true }
    };
  }
}
