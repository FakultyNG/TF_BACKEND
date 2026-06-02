export interface Bank {
  code: string;
  name: string;
}

export interface ResolvedAccount {
  accountName: string;
  accountNumber: string;
  bankCode: string;
  bankName: string;
}

export interface BankAccountSuggestion extends ResolvedAccount {
  confidence: number;
}

export interface NgnTransferResult {
  status: "processing" | "successful" | "failed";
  provider: string;
  providerReference: string;
  raw?: unknown;
}

export interface NgnTransferProviderService {
  getBanks(): Promise<Bank[]>;
  suggestBanksByAccountNumber(accountNumber: string): Promise<BankAccountSuggestion[]>;
  resolveAccount(bankCode: string, accountNumber: string): Promise<ResolvedAccount>;
  submitTransfer(input: {
    amount: number;
    accountNumber: string;
    bankCode: string;
    narration?: string;
    reference: string;
  }): Promise<NgnTransferResult>;
}
