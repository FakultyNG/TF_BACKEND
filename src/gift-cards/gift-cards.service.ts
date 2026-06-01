import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { GiftCardProductStatus, GiftCardPurchaseStatus, Prisma, TransactionStatus, TransactionType } from "@prisma/client";
import { v4 as uuid } from "uuid";
import { AuthService } from "../auth/auth.service";
import { ApiException } from "../common/errors/api.exception";
import { PricingService } from "../pricing/pricing.service";
import { GIFT_CARD_PROVIDER } from "../providers/provider.tokens";
import { GiftCardProviderService } from "../providers/gift-cards/gift-card-provider.interface";
import { RedisService } from "../redis/redis.service";
import { WalletService } from "../wallet/wallet.service";
import { GiftCardQuoteDto } from "./dto/gift-card-quote.dto";
import { GiftCardQuote } from "./gift-card-quote.types";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class GiftCardsService {
  private readonly quoteTtlSeconds = 600;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly walletService: WalletService,
    private readonly authService: AuthService,
    private readonly pricingService: PricingService,
    @Inject(GIFT_CARD_PROVIDER) private readonly giftCardProvider: GiftCardProviderService
  ) {}

  async listProducts() {
    const cached = await this.redis.getJson<Array<{ id: string; name: string; currency: string; minAmount: number; maxAmount: number }>>("gift-cards:products");
    if (cached) return cached;
    const dbProducts = await this.prisma.giftCardProduct.findMany({ where: { status: GiftCardProductStatus.active } });
    const providerProducts = dbProducts.length ? dbProducts : await this.giftCardProvider.listProducts();
    const data = providerProducts.map((item) => ({
      id: item.id,
      name: item.name,
      currency: item.currency,
      minAmount: item.minAmount,
      maxAmount: item.maxAmount
    }));
    await this.redis.setJson("gift-cards:products", data, 3600);
    return data;
  }

  async quote(userId: string, dto: GiftCardQuoteDto) {
    const product = await this.prisma.giftCardProduct.findUnique({ where: { id: dto.giftCardId } });
    if (!product || product.status !== GiftCardProductStatus.active) {
      throw new ApiException("Gift card product not found", "GIFT_CARD_NOT_FOUND", HttpStatus.NOT_FOUND);
    }
    if (dto.currency !== product.currency) {
      throw new ApiException("Gift card currency mismatch", "GIFT_CARD_CURRENCY_MISMATCH", HttpStatus.BAD_REQUEST);
    }
    if (dto.amount < product.minAmount || dto.amount > product.maxAmount) {
      throw new ApiException("Gift card amount is out of range", "GIFT_CARD_AMOUNT_OUT_OF_RANGE", HttpStatus.BAD_REQUEST);
    }
    const pricing = await this.pricingService.calculateGiftCardDebit(product.currency, dto.amount);
    const fee = pricing.fee;
    const totalNgnDebit = pricing.totalNgnDebit;
    const balance = await this.walletService.getBalance(userId);
    if (balance.balance < totalNgnDebit) {
      throw new ApiException("Insufficient wallet balance", "INSUFFICIENT_BALANCE", HttpStatus.BAD_REQUEST);
    }
    const quoteId = `quote_gift_${uuid().replace(/-/g, "").slice(0, 12)}`;
    const expiresAt = new Date(Date.now() + this.quoteTtlSeconds * 1000).toISOString();
    const quote: GiftCardQuote = {
      userId,
      giftCardId: product.id,
      giftCardName: product.name,
      amount: dto.amount,
      currency: product.currency,
      totalNgnDebit,
      fee,
      expiresAt
    };
    await this.redis.setJson(`quote:${quoteId}`, quote, this.quoteTtlSeconds);
    return { quoteId, giftCardId: quote.giftCardId, giftCardName: quote.giftCardName, amount: quote.amount, currency: quote.currency, totalNgnDebit, fee, expiresAt };
  }

  async create(userId: string, quoteId: string, passcode: string) {
    await this.authService.verifyUserPasscode(userId, passcode);
    const quote = await this.getQuote(quoteId, userId);
    const balance = await this.walletService.getBalance(userId);
    if (balance.balance < quote.totalNgnDebit) {
      throw new ApiException("Insufficient wallet balance", "INSUFFICIENT_BALANCE", HttpStatus.BAD_REQUEST);
    }
    const reference = `txn_gift_${uuid().replace(/-/g, "").slice(0, 12)}`;
    const debit = await this.walletService.debitWallet({
      userId,
      amount: quote.totalNgnDebit,
      fee: quote.fee,
      totalDebit: quote.totalNgnDebit,
      type: TransactionType.gift_card,
      status: TransactionStatus.processing,
      reference,
      description: "Gift card purchase",
      idempotencyKey: `confirm:${quoteId}`,
      payoutAmount: quote.amount,
      payoutCurrency: quote.currency,
      metadata: quote as unknown as Prisma.InputJsonValue
    });
    try {
      const providerResult = await this.giftCardProvider.createOrder({
        reference,
        giftCardId: quote.giftCardId,
        amount: quote.amount,
        currency: quote.currency
      });
      await this.prisma.giftCardPurchase.create({
        data: {
          userId,
          transactionId: debit.transaction.id,
          giftCardId: quote.giftCardId,
          giftCardName: quote.giftCardName,
          amount: quote.amount,
          currency: quote.currency,
          status: providerResult.status as GiftCardPurchaseStatus,
          providerReference: providerResult.providerReference,
          redemptionCode: providerResult.redemptionCode,
          metadata: providerResult.raw as Prisma.InputJsonValue
        }
      });
      await this.walletService.updateTransactionProvider(debit.transaction.id, providerResult.providerReference, providerResult.status === "failed" ? TransactionStatus.failed : TransactionStatus.processing);
      await this.walletService.logProvider("mock_gift_card", "gift_card_order", reference, providerResult.providerReference, providerResult.status, quote, providerResult.raw);
      await this.redis.del(`quote:${quoteId}`);
      return {
        transactionId: debit.transaction.id,
        status: providerResult.status,
        giftCardName: quote.giftCardName,
        amount: quote.amount,
        currency: quote.currency
      };
    } catch (error) {
      await this.walletService.reverseTransaction(undefined, debit.transaction.id, "Provider failed before gift card order submission");
      throw error;
    }
  }

  async getDetails(userId: string, id: string) {
    const purchase = await this.prisma.giftCardPurchase.findFirst({
      where: {
        userId,
        OR: [{ id }, { transactionId: id }]
      }
    });
    if (!purchase) throw new ApiException("Gift card purchase not found", "GIFT_CARD_PURCHASE_NOT_FOUND", HttpStatus.NOT_FOUND);
    return {
      id: purchase.id,
      giftCardName: purchase.giftCardName,
      amount: purchase.amount,
      currency: purchase.currency,
      status: purchase.status,
      recipientEmail: purchase.recipientEmail
    };
  }

  listPurchases(take = 50, skip = 0) {
    return this.prisma.giftCardPurchase.findMany({ take, skip, orderBy: { createdAt: "desc" } });
  }

  async updateProductStatus(adminId: string, giftCardId: string, status: GiftCardProductStatus) {
    const product = await this.prisma.giftCardProduct.update({ where: { id: giftCardId }, data: { status } });
    await this.redis.del("gift-cards:products");
    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        actorType: "admin",
        action: "GIFT_CARD_PRODUCT_STATUS_UPDATED",
        entityType: "GiftCardProduct",
        entityId: giftCardId,
        metadata: { status }
      }
    });
    return product;
  }

  private async getQuote(quoteId: string, userId: string) {
    const quote = await this.redis.getJson<GiftCardQuote>(`quote:${quoteId}`);
    if (!quote || quote.userId !== userId) {
      throw new ApiException("Gift card quote not found", "QUOTE_NOT_FOUND", HttpStatus.NOT_FOUND);
    }
    if (new Date(quote.expiresAt).getTime() < Date.now()) {
      await this.redis.del(`quote:${quoteId}`);
      throw new ApiException("Gift card quote expired", "QUOTE_EXPIRED", HttpStatus.BAD_REQUEST);
    }
    return quote;
  }
}
