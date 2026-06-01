import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma, TransactionStatus, TransactionType } from "@prisma/client";
import { v4 as uuid } from "uuid";
import { AuthService } from "../auth/auth.service";
import { ApiException } from "../common/errors/api.exception";
import { FxPayoutProviderService } from "../providers/fx-payout/fx-payout-provider.interface";
import { PricingService } from "../pricing/pricing.service";
import { FX_PAYOUT_PROVIDER, NGN_TRANSFER_PROVIDER } from "../providers/provider.tokens";
import { NgnTransferProviderService } from "../providers/transfers/ngn-transfer-provider.interface";
import { RedisService } from "../redis/redis.service";
import { WalletService } from "../wallet/wallet.service";
import { FxTransferQuoteDto } from "./dto/fx-transfer-quote.dto";
import { NgnTransferQuoteDto } from "./dto/ngn-transfer-quote.dto";
import { FxQuote, NgnQuote } from "./quote.types";
import { RecentBeneficiariesService } from "./recent-beneficiaries.service";

@Injectable()
export class TransfersService {
  private readonly quoteTtlSeconds = 600;

  constructor(
    private readonly redis: RedisService,
    private readonly walletService: WalletService,
    private readonly authService: AuthService,
    private readonly config: ConfigService,
    private readonly pricingService: PricingService,
    private readonly recentBeneficiaries: RecentBeneficiariesService,
    @Inject(NGN_TRANSFER_PROVIDER) private readonly ngnProvider: NgnTransferProviderService,
    @Inject(FX_PAYOUT_PROVIDER) private readonly fxProvider: FxPayoutProviderService
  ) {}

  async getBanks() {
    const cached = await this.redis.getJson<Array<{ code: string; name: string }>>("banks:ngn");
    if (cached) return cached;
    const banks = await this.ngnProvider.getBanks();
    await this.redis.setJson("banks:ngn", banks, 86400);
    return banks;
  }

  resolveAccount(bankCode: string, accountNumber: string) {
    return this.ngnProvider.resolveAccount(bankCode, accountNumber);
  }

  async suggestBanksByAccountNumber(accountNumber: string) {
    const providerSuggestions = await this.ngnProvider.suggestBanksByAccountNumber(accountNumber);
    const suggestions = [...providerSuggestions].sort((left, right) => right.confidence - left.confidence).slice(0, 3);
    return { accountNumber, suggestions };
  }

  async quoteNgn(userId: string, dto: NgnTransferQuoteDto) {
    const balance = await this.walletService.getBalance(userId);
    const fee = await this.pricingService.calculateNgnTransferFee(dto.amount);
    const totalDebit = dto.amount + fee;
    if (balance.balance < totalDebit) {
      throw new ApiException("Insufficient wallet balance", "INSUFFICIENT_BALANCE", HttpStatus.BAD_REQUEST);
    }
    const account = await this.resolveAccount(dto.bankCode, dto.accountNumber);
    const quoteId = `quote_ngn_${uuid().replace(/-/g, "").slice(0, 12)}`;
    const expiresAt = new Date(Date.now() + this.quoteTtlSeconds * 1000).toISOString();
    const quote: NgnQuote = {
      userId,
      bankCode: dto.bankCode,
      bankName: account.bankName,
      accountNumber: dto.accountNumber,
      accountName: account.accountName,
      amount: dto.amount,
      fee,
      totalDebit,
      currency: "NGN",
      narration: dto.narration,
      expiresAt
    };
    await this.redis.setJson(`quote:${quoteId}`, quote, this.quoteTtlSeconds);
    return {
      amount: quote.amount,
      fee: quote.fee,
      totalDebit: quote.totalDebit,
      currency: quote.currency,
      quoteId,
      narration: quote.narration,
      expiresAt
    };
  }

  async confirmNgn(userId: string, quoteId: string, passcode: string, narration?: string) {
    await this.authService.verifyUserPasscode(userId, passcode);
    const quote = await this.getQuote<NgnQuote>(quoteId, userId);
    const balance = await this.walletService.getBalance(userId);
    if (balance.balance < quote.totalDebit) {
      throw new ApiException("Insufficient wallet balance", "INSUFFICIENT_BALANCE", HttpStatus.BAD_REQUEST);
    }
    const reference = `txn_ngn_${uuid().replace(/-/g, "").slice(0, 12)}`;
    const debit = await this.walletService.debitWallet({
      userId,
      amount: quote.totalDebit,
      fee: quote.fee,
      totalDebit: quote.totalDebit,
      type: TransactionType.ngn_transfer,
      status: TransactionStatus.processing,
      reference,
      description: "NGN transfer",
      narration: narration || quote.narration,
      idempotencyKey: `confirm:${quoteId}`,
      metadata: quote as unknown as Prisma.InputJsonValue
    });
    try {
      const providerResult = await this.ngnProvider.submitTransfer({
        amount: quote.amount,
        accountNumber: quote.accountNumber,
        bankCode: quote.bankCode,
        narration: narration || quote.narration,
        reference
      });
      await this.walletService.updateTransactionProvider(debit.transaction.id, providerResult.providerReference, providerResult.status as TransactionStatus);
      await this.walletService.logProvider("mock_lync", "ngn_transfer", reference, providerResult.providerReference, providerResult.status, quote, providerResult.raw);
      await this.recentBeneficiaries.saveOrUpdateNgnBeneficiary(userId, quote, debit.transaction.id);
      await this.redis.del(`quote:${quoteId}`);
      return {
        transactionId: debit.transaction.id,
        status: providerResult.status,
        amount: quote.amount,
        currency: "NGN",
        narration: narration || quote.narration
      };
    } catch (error) {
      await this.walletService.reverseTransaction(undefined, debit.transaction.id, "Provider failed before NGN transfer submission");
      throw error;
    }
  }

  async quoteFx(userId: string, payoutCurrency: "USD" | "CNY", dto: FxTransferQuoteDto) {
    const providerQuote = await this.pricingService.getFxPricing(payoutCurrency, dto.amount);
    const balance = await this.walletService.getBalance(userId);
    if (balance.balance < providerQuote.totalNgnDebit) {
      throw new ApiException("Insufficient wallet balance", "INSUFFICIENT_BALANCE", HttpStatus.BAD_REQUEST);
    }
    const quoteId = `quote_${payoutCurrency.toLowerCase()}_${uuid().replace(/-/g, "").slice(0, 12)}`;
    const expiresAt = new Date(Date.now() + this.quoteTtlSeconds * 1000).toISOString();
    const recipientName = String(dto.beneficiary.accountName || dto.beneficiary.recipientName || "");
    const quote: FxQuote = {
      userId,
      payoutCurrency,
      payoutAmount: dto.amount,
      purpose: dto.purpose,
      recipientName,
      recipientCountry: dto.recipientCountry,
      paymentReference: dto.paymentReference,
      beneficiary: dto.beneficiary,
      fxRate: providerQuote.fxRate,
      providerFee: providerQuote.providerFee,
      tfFee: providerQuote.tfFee,
      totalNgnDebit: providerQuote.totalNgnDebit,
      estimatedSettlementTime: providerQuote.estimatedSettlementTime,
      expiresAt
    };
    await this.redis.setJson(`quote:${quoteId}`, quote, this.quoteTtlSeconds);
    return { quoteId, ...this.toFxQuoteResponse(quote) };
  }

  async confirmFx(userId: string, payoutCurrency: "USD" | "CNY", quoteId: string, passcode: string, purpose?: string) {
    await this.authService.verifyUserPasscode(userId, passcode);
    const quote = await this.getQuote<FxQuote>(quoteId, userId);
    if (quote.payoutCurrency !== payoutCurrency) {
      throw new ApiException("Invalid transfer quote", "INVALID_QUOTE", HttpStatus.BAD_REQUEST);
    }
    const balance = await this.walletService.getBalance(userId);
    if (balance.balance < quote.totalNgnDebit) {
      throw new ApiException("Insufficient wallet balance", "INSUFFICIENT_BALANCE", HttpStatus.BAD_REQUEST);
    }
    const reference = `txn_${payoutCurrency.toLowerCase()}_${uuid().replace(/-/g, "").slice(0, 12)}`;
    const debit = await this.walletService.debitWallet({
      userId,
      amount: quote.totalNgnDebit,
      fee: quote.providerFee + quote.tfFee,
      totalDebit: quote.totalNgnDebit,
      type: payoutCurrency === "USD" ? TransactionType.usd_transfer : TransactionType.cny_transfer,
      status: TransactionStatus.processing,
      reference,
      provider: "mock_lync",
      description: `${payoutCurrency} transfer`,
      narration: quote.paymentReference,
      idempotencyKey: `confirm:${quoteId}`,
      payoutAmount: quote.payoutAmount,
      payoutCurrency,
      metadata: quote as unknown as Prisma.InputJsonValue
    });
    try {
      const providerResult = await this.fxProvider.submitPayout({
        reference,
        payoutCurrency,
        payoutAmount: quote.payoutAmount,
        beneficiary: quote.beneficiary
      });
      await this.walletService.updateTransactionProvider(debit.transaction.id, providerResult.providerReference, providerResult.status as TransactionStatus);
      await this.walletService.logProvider("mock_lync", `${payoutCurrency.toLowerCase()}_payout`, reference, providerResult.providerReference, providerResult.status, quote, providerResult.raw);
      await this.recentBeneficiaries.saveOrUpdateSupplierBeneficiary(
        userId,
        payoutCurrency === "USD" ? TransactionType.usd_transfer : TransactionType.cny_transfer,
        quote,
        debit.transaction.id
      );
      await this.redis.del(`quote:${quoteId}`);
      return {
        transactionId: debit.transaction.id,
        status: providerResult.status,
        payoutAmount: quote.payoutAmount,
        purpose: purpose || quote.purpose,
        payoutCurrency: quote.payoutCurrency,
        totalNgnDebit: quote.totalNgnDebit
      };
    } catch (error) {
      await this.walletService.reverseTransaction(undefined, debit.transaction.id, `Provider failed before ${payoutCurrency} payout submission`);
      throw error;
    }
  }

  listTransfers(type: TransactionType, take = 50, skip = 0) {
    return this.walletService.listTransactions({ type, take, skip });
  }

  private async getQuote<T extends { expiresAt: string; userId: string }>(quoteId: string, userId: string) {
    const quote = await this.redis.getJson<T>(`quote:${quoteId}`);
    if (!quote || quote.userId !== userId) {
      throw new ApiException("Transfer quote not found", "QUOTE_NOT_FOUND", HttpStatus.NOT_FOUND);
    }
    if (new Date(quote.expiresAt).getTime() < Date.now()) {
      await this.redis.del(`quote:${quoteId}`);
      throw new ApiException("Transfer quote expired", "QUOTE_EXPIRED", HttpStatus.BAD_REQUEST);
    }
    return quote;
  }

  private toFxQuoteResponse(quote: FxQuote) {
    return {
      payoutCurrency: quote.payoutCurrency,
      payoutAmount: quote.payoutAmount,
      purpose: quote.purpose,
      recipientName: quote.recipientName,
      recipientCountry: quote.recipientCountry,
      fxRate: quote.fxRate,
      providerFee: quote.providerFee,
      tfFee: quote.tfFee,
      totalNgnDebit: quote.totalNgnDebit,
      estimatedSettlementTime: quote.estimatedSettlementTime,
      expiresAt: quote.expiresAt
    };
  }
}
