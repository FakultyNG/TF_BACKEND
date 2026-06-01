import { HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { ApiException } from "../common/errors/api.exception";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import {
  FEE_CONFIG_KEYS,
  FeeConfigKey,
  FeeRule,
  FxTransferFeeConfig,
  GiftCardFeeConfig,
  NgnTransferFeeConfig
} from "./pricing.types";

@Injectable()
export class PricingService {
  private readonly cacheTtlSeconds = 300;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService
  ) {}

  async listConfigs() {
    const rows = await this.prisma.feeConfig.findMany({ orderBy: { key: "asc" } });
    const existingKeys = new Set(rows.map((row) => row.key));
    const defaults = FEE_CONFIG_KEYS.filter((key) => !existingKeys.has(key)).map((key) => ({
      key,
      config: this.defaultConfig(key),
      description: this.descriptionFor(key),
      source: "default"
    }));
    return [
      ...rows.map((row) => ({ ...row, source: "database" })),
      ...defaults
    ];
  }

  async getConfig(key: FeeConfigKey) {
    this.assertAllowedKey(key);
    const cacheKey = `fee-config:${key}`;
    const cached = await this.redis.getJson<Record<string, unknown>>(cacheKey);
    if (cached) return cached;

    const row = await this.prisma.feeConfig.findUnique({ where: { key } });
    const value = (row?.config as Record<string, unknown> | undefined) ?? this.defaultConfig(key);
    await this.redis.setJson(cacheKey, value, this.cacheTtlSeconds);
    return value;
  }

  async updateConfig(adminId: string, key: FeeConfigKey, config: Record<string, unknown>) {
    this.assertAllowedKey(key);
    const normalized = this.normalizeConfig(key, config);
    const updated = await this.prisma.feeConfig.upsert({
      where: { key },
      create: {
        key,
        config: normalized as unknown as Prisma.InputJsonObject,
        description: this.descriptionFor(key),
        updatedById: adminId
      },
      update: {
        config: normalized as unknown as Prisma.InputJsonObject,
        description: this.descriptionFor(key),
        updatedById: adminId
      }
    });
    await this.redis.del(`fee-config:${key}`);
    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        actorType: "admin",
        action: "FEE_CONFIG_UPDATED",
        entityType: "FeeConfig",
        entityId: key,
        metadata: { config: normalized } as unknown as Prisma.InputJsonObject
      }
    });
    return updated;
  }

  async calculateNgnTransferFee(amount: number) {
    const feeConfig = this.normalizeNgnConfig(await this.getConfig("ngn_transfer"));
    return this.calculateFee(feeConfig.fee, amount);
  }

  async getFxPricing(payoutCurrency: "USD" | "CNY", payoutAmount: number) {
    const key = payoutCurrency === "USD" ? "usd_transfer" : "cny_transfer";
    const feeConfig = this.normalizeFxConfig(await this.getConfig(key));
    const convertedAmount = payoutAmount * feeConfig.fxRate;
    const providerFee = this.calculateFee(feeConfig.providerFee, convertedAmount);
    const tfFee = this.calculateFee(feeConfig.tfFee, convertedAmount);
    return {
      payoutCurrency,
      payoutAmount,
      fxRate: feeConfig.fxRate,
      providerFee,
      tfFee,
      totalNgnDebit: convertedAmount + providerFee + tfFee,
      estimatedSettlementTime: feeConfig.estimatedSettlementTime
    };
  }

  async calculateGiftCardDebit(currency: string, amount: number) {
    const feeConfig = this.normalizeGiftCardConfig(await this.getConfig("gift_card"));
    const fxRate = currency === "CNY" ? feeConfig.cnyFxRate : feeConfig.usdFxRate;
    const convertedAmount = amount * fxRate;
    const fee = this.calculateFee(feeConfig.fee, convertedAmount);
    return {
      fee,
      fxRate,
      totalNgnDebit: convertedAmount + fee
    };
  }

  private normalizeConfig(key: FeeConfigKey, config: Record<string, unknown>) {
    if (key === "ngn_transfer") return this.normalizeNgnConfig(config);
    if (key === "gift_card") return this.normalizeGiftCardConfig(config);
    return this.normalizeFxConfig(config);
  }

  private normalizeNgnConfig(config: Record<string, unknown>): NgnTransferFeeConfig {
    const legacyPercentage = config.percentageBps;
    const fee = legacyPercentage !== undefined
      ? this.normalizeFeeRule({ mode: "percentage", percentageBps: legacyPercentage, minFee: config.minFee ?? 0, maxFee: config.maxFee ?? Number.MAX_SAFE_INTEGER }, "fee")
      : this.normalizeFeeRule(config.fee, "fee");
    return { fee };
  }

  private normalizeFxConfig(config: Record<string, unknown>): FxTransferFeeConfig {
    const fxRate = this.requiredInt(config.fxRate, "fxRate", 1);
    const providerFee = this.normalizeFeeRule(config.providerFee, "providerFee");
    const tfFee = this.normalizeFeeRule(config.tfFee, "tfFee");
    const estimatedSettlementTime = String(config.estimatedSettlementTime || "1-3 business days");
    return { fxRate, providerFee, tfFee, estimatedSettlementTime };
  }

  private normalizeGiftCardConfig(config: Record<string, unknown>): GiftCardFeeConfig {
    const usdFxRate = this.requiredInt(config.usdFxRate, "usdFxRate", 1);
    const cnyFxRate = this.requiredInt(config.cnyFxRate, "cnyFxRate", 1);
    const fee = this.normalizeFeeRule(config.fee, "fee");
    return { usdFxRate, cnyFxRate, fee };
  }

  private normalizeFeeRule(value: unknown, field: string): FeeRule {
    if (typeof value === "number" || typeof value === "string") {
      return { mode: "fixed", fixedFee: this.requiredInt(value, field, 0) };
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new ApiException(`Invalid fee config field: ${field}`, "INVALID_FEE_CONFIG", HttpStatus.BAD_REQUEST);
    }
    const rule = value as Record<string, unknown>;
    if (rule.mode === "fixed") {
      return { mode: "fixed", fixedFee: this.requiredInt(rule.fixedFee, `${field}.fixedFee`, 0) };
    }
    if (rule.mode === "percentage") {
      const percentageBps = this.requiredInt(rule.percentageBps, `${field}.percentageBps`, 0);
      const minFee = this.requiredInt(rule.minFee, `${field}.minFee`, 0);
      const maxFee = this.requiredInt(rule.maxFee, `${field}.maxFee`, 0);
      if (maxFee < minFee) {
        throw new ApiException(`Invalid fee config field: ${field}.maxFee`, "INVALID_FEE_CONFIG", HttpStatus.BAD_REQUEST);
      }
      return { mode: "percentage", percentageBps, minFee, maxFee };
    }
    throw new ApiException(`Invalid fee config field: ${field}.mode`, "INVALID_FEE_CONFIG", HttpStatus.BAD_REQUEST);
  }

  private calculateFee(rule: FeeRule, amount: number) {
    if (rule.mode === "fixed") return rule.fixedFee;
    const percentageFee = Math.ceil((amount * rule.percentageBps) / 10000);
    return Math.min(rule.maxFee, Math.max(rule.minFee, percentageFee));
  }

  private requiredInt(value: unknown, field: string, min: number) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < min) {
      throw new ApiException(`Invalid fee config field: ${field}`, "INVALID_FEE_CONFIG", HttpStatus.BAD_REQUEST);
    }
    return parsed;
  }

  private defaultConfig(key: FeeConfigKey) {
    if (key === "ngn_transfer") {
      return {
        fee: {
          mode: "fixed",
          fixedFee: Number(this.config.get<string>("NGN_TRANSFER_FIXED_FEE", "100"))
        }
      };
    }
    if (key === "usd_transfer") {
      return {
        fxRate: Number(this.config.get<string>("USD_MOCK_FX_RATE", "1650")),
        providerFee: { mode: "fixed", fixedFee: Number(this.config.get<string>("USD_PROVIDER_FEE_NGN", "2500")) },
        tfFee: { mode: "fixed", fixedFee: Number(this.config.get<string>("USD_TF_FEE_NGN", "1500")) },
        estimatedSettlementTime: this.config.get<string>("USD_SETTLEMENT_TIME", "1-3 business days")
      };
    }
    if (key === "cny_transfer") {
      return {
        fxRate: Number(this.config.get<string>("CNY_MOCK_FX_RATE", "230")),
        providerFee: { mode: "fixed", fixedFee: Number(this.config.get<string>("CNY_PROVIDER_FEE_NGN", "3000")) },
        tfFee: { mode: "fixed", fixedFee: Number(this.config.get<string>("CNY_TF_FEE_NGN", "2500")) },
        estimatedSettlementTime: this.config.get<string>("CNY_SETTLEMENT_TIME", "1-3 business days")
      };
    }
    return {
      usdFxRate: Number(this.config.get<string>("GIFT_CARD_USD_FX_RATE", "1680")),
      cnyFxRate: Number(this.config.get<string>("GIFT_CARD_CNY_FX_RATE", "230")),
      fee: { mode: "fixed", fixedFee: Number(this.config.get<string>("GIFT_CARD_FEE_NGN", "1000")) }
    };
  }

  private descriptionFor(key: FeeConfigKey) {
    const descriptions: Record<FeeConfigKey, string> = {
      ngn_transfer: "NGN bank transfer fee rule",
      usd_transfer: "USD supplier payout pricing rule",
      cny_transfer: "CNY supplier payout pricing rule",
      gift_card: "Gift card purchase pricing rule"
    };
    return descriptions[key];
  }

  private assertAllowedKey(key: string): asserts key is FeeConfigKey {
    if (!FEE_CONFIG_KEYS.includes(key as FeeConfigKey)) {
      throw new ApiException("Fee config not found", "FEE_CONFIG_NOT_FOUND", HttpStatus.NOT_FOUND);
    }
  }
}
