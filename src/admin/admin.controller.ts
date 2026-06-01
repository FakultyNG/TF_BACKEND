import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { TransactionStatus, TransactionType, UserRole } from "@prisma/client";
import { AuthService } from "../auth/auth.service";
import { AdminJwtAuthGuard } from "../auth/guards/admin-jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { success } from "../common/api-response";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { KycService } from "../kyc/kyc.service";
import { WalletService } from "../wallet/wallet.service";
import { AdminWalletAdjustDto } from "../wallet/dto/admin-wallet-adjust.dto";
import { TransfersService } from "../transfers/transfers.service";
import { GiftCardsService } from "../gift-cards/gift-cards.service";
import { PricingService } from "../pricing/pricing.service";
import { FeeConfigKey } from "../pricing/pricing.types";
import { AdminDvaQueryDto } from "./dto/admin-dva-query.dto";
import { AdminPaginationDto } from "./dto/admin-pagination.dto";
import { AdminReasonDto } from "./dto/admin-reason.dto";
import { AdminTransactionQueryDto } from "./dto/admin-transaction-query.dto";
import { AdminLoginDto } from "./dto/admin-login.dto";
import { UpdateKycStatusDto } from "./dto/update-kyc-status.dto";
import { UpdateFeeConfigDto } from "./dto/update-fee-config.dto";
import { UpdateGiftCardProductStatusDto } from "./dto/update-gift-card-product-status.dto";
import { AdminService } from "./admin.service";

@ApiTags("Admin")
@Controller("admin")
export class AdminController {
  constructor(
    private readonly authService: AuthService,
    private readonly adminService: AdminService,
    private readonly kycService: KycService,
    private readonly walletService: WalletService,
    private readonly transfersService: TransfersService,
    private readonly giftCardsService: GiftCardsService,
    private readonly pricingService: PricingService
  ) {}

  @Post("auth/login")
  async login(@Body() dto: AdminLoginDto) {
    const data = await this.authService.issueAdminToken(dto.phoneNumber, dto.passcode);
    return success("Admin login successful", data);
  }

  @ApiBearerAuth()
  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPPORT, UserRole.COMPLIANCE, UserRole.SUPER_ADMIN)
  @Get("users")
  async users(@CurrentUser() admin: { sub: string }, @Query() query: AdminPaginationDto) {
    await this.adminService.auditAdminView(admin.sub, "ADMIN_USERS_VIEWED", "User");
    const data = await this.adminService.listUsers(query.take ?? 50, query.skip ?? 0);
    return success("Users fetched successfully", data);
  }

  @ApiBearerAuth()
  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPPORT, UserRole.COMPLIANCE, UserRole.SUPER_ADMIN)
  @Get("users/:id")
  async user(@CurrentUser() admin: { sub: string }, @Param("id") id: string) {
    await this.adminService.auditAdminView(admin.sub, "ADMIN_USER_VIEWED", "User", id);
    const data = await this.adminService.getUser(id);
    return success("User fetched successfully", data);
  }

  @ApiBearerAuth()
  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.COMPLIANCE, UserRole.SUPER_ADMIN)
  @Get("kyc-records")
  async kycRecords(@CurrentUser() admin: { sub: string }, @Query() query: AdminPaginationDto) {
    await this.adminService.auditAdminView(admin.sub, "ADMIN_KYC_RECORDS_VIEWED", "KycRecord");
    const data = await this.kycService.listRecords(query.take ?? 50, query.skip ?? 0);
    return success("KYC records fetched successfully", data);
  }

  @ApiBearerAuth()
  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.COMPLIANCE, UserRole.SUPER_ADMIN)
  @Patch("kyc-records/:id/status")
  async updateKyc(@CurrentUser() admin: { sub: string }, @Param("id") id: string, @Body() dto: UpdateKycStatusDto) {
    const data = await this.kycService.updateStatus(admin.sub, id, dto.status);
    return success("KYC status updated successfully", data);
  }

  @ApiBearerAuth()
  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.COMPLIANCE, UserRole.SUPER_ADMIN)
  @Get("auth-sessions")
  async sessions(@CurrentUser() admin: { sub: string }, @Query() query: AdminPaginationDto) {
    await this.adminService.auditAdminView(admin.sub, "ADMIN_AUTH_SESSIONS_VIEWED", "AuthSession");
    const data = await this.adminService.listAuthSessions(query.take ?? 50, query.skip ?? 0);
    return success("Auth sessions fetched successfully", data);
  }

  @ApiBearerAuth()
  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.COMPLIANCE, UserRole.SUPER_ADMIN)
  @Get("audit-logs")
  async auditLogs(@CurrentUser() admin: { sub: string }, @Query() query: AdminPaginationDto) {
    await this.adminService.auditAdminView(admin.sub, "ADMIN_AUDIT_LOGS_VIEWED", "AuditLog");
    const data = await this.adminService.listAuditLogs(query.take ?? 50, query.skip ?? 0);
    return success("Audit logs fetched successfully", data);
  }

  @ApiBearerAuth()
  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPPORT, UserRole.COMPLIANCE, UserRole.FINANCE, UserRole.SUPER_ADMIN)
  @Get("dva")
  async dvas(@CurrentUser() admin: { sub: string }, @Query() query: AdminDvaQueryDto) {
    await this.adminService.auditAdminView(admin.sub, "ADMIN_DVA_LIST_VIEWED", "DedicatedVirtualAccount");
    const data = await this.walletService.listDvas({
      take: query.take ?? 50,
      skip: query.skip ?? 0,
      search: query.search,
      provider: query.provider,
      status: query.status
    });
    return success("DVA records fetched successfully", data);
  }

  @ApiBearerAuth()
  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPPORT, UserRole.COMPLIANCE, UserRole.FINANCE, UserRole.SUPER_ADMIN)
  @Get("dva/:dvaId")
  async dva(@CurrentUser() admin: { sub: string }, @Param("dvaId") dvaId: string) {
    await this.adminService.auditAdminView(admin.sub, "ADMIN_DVA_VIEWED", "DedicatedVirtualAccount", dvaId);
    const data = await this.walletService.getDvaById(dvaId);
    return success("DVA record fetched successfully", data);
  }

  @ApiBearerAuth()
  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.COMPLIANCE, UserRole.FINANCE, UserRole.SUPER_ADMIN)
  @Post("users/:userId/dva/recreate")
  async recreateDva(@CurrentUser() admin: { sub: string }, @Param("userId") userId: string) {
    const data = await this.walletService.recreateDva(admin.sub, userId);
    return success("Dedicated virtual account recreated successfully", data);
  }

  @ApiBearerAuth()
  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPPORT, UserRole.COMPLIANCE, UserRole.FINANCE, UserRole.SUPER_ADMIN)
  @Get("users/:userId/wallet")
  async userWallet(@CurrentUser() admin: { sub: string }, @Param("userId") userId: string) {
    await this.adminService.auditAdminView(admin.sub, "ADMIN_USER_WALLET_VIEWED", "Wallet", userId);
    const data = await this.walletService.getUserWallet(userId);
    return success("User wallet fetched successfully", data);
  }

  @ApiBearerAuth()
  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPPORT, UserRole.COMPLIANCE, UserRole.FINANCE, UserRole.SUPER_ADMIN)
  @Get("users/:userId/wallet/ledger")
  async userLedger(@CurrentUser() admin: { sub: string }, @Param("userId") userId: string, @Query() query: AdminPaginationDto) {
    await this.adminService.auditAdminView(admin.sub, "ADMIN_USER_WALLET_LEDGER_VIEWED", "WalletLedger", userId);
    const data = await this.walletService.getUserLedger(userId, query.take ?? 50, query.skip ?? 0);
    return success("User wallet ledger fetched successfully", data);
  }

  @ApiBearerAuth()
  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles(UserRole.FINANCE, UserRole.SUPER_ADMIN)
  @Post("users/:userId/wallet/adjust")
  async adjustWallet(@CurrentUser() admin: { sub: string }, @Param("userId") userId: string, @Body() dto: AdminWalletAdjustDto) {
    const data = await this.walletService.adminAdjustWallet(admin.sub, userId, dto.direction, dto.amount, dto.reason);
    return success("Wallet adjusted successfully", data);
  }

  @ApiBearerAuth()
  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPPORT, UserRole.COMPLIANCE, UserRole.FINANCE, UserRole.SUPER_ADMIN)
  @Get("transactions")
  async transactions(@CurrentUser() admin: { sub: string }, @Query() query: AdminTransactionQueryDto) {
    await this.adminService.auditAdminView(admin.sub, "ADMIN_TRANSACTIONS_VIEWED", "Transaction");
    const data = await this.walletService.listTransactions({
      take: query.take ?? 50,
      skip: query.skip ?? 0,
      type: query.type,
      status: query.status,
      userId: query.userId,
      currency: query.currency,
      dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
      dateTo: query.dateTo ? new Date(query.dateTo) : undefined
    });
    return success("Transactions fetched successfully", data);
  }

  @ApiBearerAuth()
  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPPORT, UserRole.COMPLIANCE, UserRole.FINANCE, UserRole.SUPER_ADMIN)
  @Get("transactions/:transactionId")
  async transaction(@CurrentUser() admin: { sub: string; role: string }, @Param("transactionId") transactionId: string) {
    await this.adminService.auditAdminView(admin.sub, "ADMIN_TRANSACTION_VIEWED", "Transaction", transactionId);
    const data = await this.walletService.getTransaction(transactionId, admin.role);
    return success("Transaction fetched successfully", data);
  }

  @ApiBearerAuth()
  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.FINANCE, UserRole.SUPER_ADMIN)
  @Post("transactions/:transactionId/retry")
  async retryTransaction(@CurrentUser() admin: { sub: string }, @Param("transactionId") transactionId: string) {
    await this.adminService.auditAdminView(admin.sub, "ADMIN_TRANSACTION_RETRY_REQUESTED", "Transaction", transactionId);
    const data = await this.walletService.updateTransactionProvider(transactionId, `retry_${Date.now()}`, TransactionStatus.processing);
    return success("Transaction retry submitted successfully", data);
  }

  @ApiBearerAuth()
  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles(UserRole.FINANCE, UserRole.SUPER_ADMIN)
  @Post("transactions/:transactionId/reverse")
  async reverseTransaction(@CurrentUser() admin: { sub: string }, @Param("transactionId") transactionId: string, @Body() dto: AdminReasonDto) {
    const data = await this.walletService.reverseTransaction(admin.sub, transactionId, dto.reason || "Admin reversal");
    return success("Transaction reversed successfully", data);
  }

  @ApiBearerAuth()
  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPPORT, UserRole.COMPLIANCE, UserRole.FINANCE, UserRole.SUPER_ADMIN)
  @Get("transfers/ngn")
  async ngnTransfers(@Query() query: AdminPaginationDto) {
    const data = await this.transfersService.listTransfers(TransactionType.ngn_transfer, query.take ?? 50, query.skip ?? 0);
    return success("NGN transfers fetched successfully", data);
  }

  @ApiBearerAuth()
  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPPORT, UserRole.COMPLIANCE, UserRole.FINANCE, UserRole.SUPER_ADMIN)
  @Get("transfers/usd")
  async usdTransfers(@Query() query: AdminPaginationDto) {
    const data = await this.transfersService.listTransfers(TransactionType.usd_transfer, query.take ?? 50, query.skip ?? 0);
    return success("USD transfers fetched successfully", data);
  }

  @ApiBearerAuth()
  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPPORT, UserRole.COMPLIANCE, UserRole.FINANCE, UserRole.SUPER_ADMIN)
  @Get("transfers/cny")
  async cnyTransfers(@Query() query: AdminPaginationDto) {
    const data = await this.transfersService.listTransfers(TransactionType.cny_transfer, query.take ?? 50, query.skip ?? 0);
    return success("CNY transfers fetched successfully", data);
  }

  @ApiBearerAuth()
  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPPORT, UserRole.COMPLIANCE, UserRole.FINANCE, UserRole.SUPER_ADMIN)
  @Get("gift-cards/purchases")
  async giftCardPurchases(@Query() query: AdminPaginationDto) {
    const data = await this.giftCardsService.listPurchases(query.take ?? 50, query.skip ?? 0);
    return success("Gift card purchases fetched successfully", data);
  }

  @ApiBearerAuth()
  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.FINANCE, UserRole.SUPER_ADMIN)
  @Get("fees")
  async fees(@CurrentUser() admin: { sub: string }) {
    await this.adminService.auditAdminView(admin.sub, "ADMIN_FEES_VIEWED", "FeeConfig");
    const data = await this.pricingService.listConfigs();
    return success("Fee configs fetched successfully", data);
  }

  @ApiBearerAuth()
  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.FINANCE, UserRole.SUPER_ADMIN)
  @Get("fees/:key")
  async fee(@CurrentUser() admin: { sub: string }, @Param("key") key: FeeConfigKey) {
    await this.adminService.auditAdminView(admin.sub, "ADMIN_FEE_VIEWED", "FeeConfig", key);
    const data = await this.pricingService.getConfig(key);
    return success("Fee config fetched successfully", data);
  }

  @ApiBearerAuth()
  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles(UserRole.FINANCE, UserRole.SUPER_ADMIN)
  @Patch("fees/:key")
  async updateFee(@CurrentUser() admin: { sub: string }, @Param("key") key: FeeConfigKey, @Body() dto: UpdateFeeConfigDto) {
    const data = await this.pricingService.updateConfig(admin.sub, key, dto.config);
    return success("Fee config updated successfully", data);
  }

  @ApiBearerAuth()
  @UseGuards(AdminJwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.FINANCE, UserRole.SUPER_ADMIN)
  @Patch("gift-cards/products/:giftCardId/status")
  async updateGiftCardStatus(@CurrentUser() admin: { sub: string }, @Param("giftCardId") giftCardId: string, @Body() dto: UpdateGiftCardProductStatusDto) {
    const data = await this.giftCardsService.updateProductStatus(admin.sub, giftCardId, dto.status);
    return success("Gift card product status updated successfully", data);
  }
}
