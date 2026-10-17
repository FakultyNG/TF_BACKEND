import { Injectable } from "@nestjs/common";
import { UsersRepository } from "./users.repository";

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  toContractUser(user: {
    id: string;
    phoneNumber: string;
    walletStatus: string;
    accountTier?: string;
    addMoneyClickedAt?: Date | null;
    kycRecords?: Array<{ status: string }>;
  }) {
    return {
      id: user.id,
      phoneNumber: user.phoneNumber,
      kycStatus: user.kycRecords?.[0]?.status ?? "not_started",
      walletStatus: user.walletStatus,
      accountTier: user.accountTier ?? "citizen",
      showAddMoney: !user.addMoneyClickedAt
    };
  }
}
