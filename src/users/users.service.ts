import { Injectable } from "@nestjs/common";
import { UsersRepository } from "./users.repository";

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  toContractUser(user: { id: string; phoneNumber: string; walletStatus: string; kycRecords?: Array<{ status: string }> }) {
    return {
      id: user.id,
      phoneNumber: user.phoneNumber,
      kycStatus: user.kycRecords?.[0]?.status ?? "not_started",
      walletStatus: user.walletStatus
    };
  }
}
