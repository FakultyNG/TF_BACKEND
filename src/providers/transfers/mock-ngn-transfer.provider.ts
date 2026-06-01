import { Injectable } from "@nestjs/common";
import { Bank, BankAccountSuggestion, NgnTransferProviderService, NgnTransferResult, ResolvedAccount } from "./ngn-transfer-provider.interface";

export const MOCK_BANKS: Bank[] = [
  { code: "044", name: "Access Bank" },
  { code: "058", name: "GTBank" },
  { code: "035", name: "Wema Bank" },
  { code: "999", name: "OPay" }
];

@Injectable()
export class MockNgnTransferProvider implements NgnTransferProviderService {
  async getBanks(): Promise<Bank[]> {
    return MOCK_BANKS;
  }

  async suggestBanksByAccountNumber(accountNumber: string): Promise<BankAccountSuggestion[]> {
    const firstDigit = Number(accountNumber[0] ?? "0");
    const candidates = [0, 1, 2].map((offset) => MOCK_BANKS[(firstDigit + offset) % MOCK_BANKS.length]);
    const confidenceScores = [95, 88, 80];

    return candidates.map((bank, index) => ({
      accountName: "JOHN DOE",
      accountNumber,
      bankCode: bank.code,
      bankName: bank.name,
      confidence: confidenceScores[index]
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
      providerReference: `mock_ngn_${input.reference}`,
      raw: { submitted: true }
    };
  }
}
