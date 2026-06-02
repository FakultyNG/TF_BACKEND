export interface CreateDvaInput {
  userId: string;
  phoneNumber: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  bvn?: string | null;
  dateOfBirth?: Date | string | null;
  preferredBank?: string;
}

export interface CreateDvaResult {
  bankName: string;
  accountNumber: string;
  accountName: string;
  provider: string;
  providerReference: string;
  status: "active" | "inactive" | "failed";
  raw?: unknown;
}

export interface VerifyFundingResult {
  reference: string;
  amount: number;
  currency: "NGN";
  status: "successful" | "failed" | "pending";
  provider: string;
  providerReference: string;
  raw?: unknown;
}

export interface DvaProviderService {
  createDedicatedVirtualAccount(input: CreateDvaInput): Promise<CreateDvaResult>;
  verifyFunding(reference: string): Promise<VerifyFundingResult>;
}
