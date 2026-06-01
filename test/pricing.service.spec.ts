import { PricingService } from "../src/pricing/pricing.service";

describe("PricingService", () => {
  const createService = (rows: Record<string, Record<string, unknown>>) => {
    const redis = {
      getJson: jest.fn().mockResolvedValue(null),
      setJson: jest.fn(),
      del: jest.fn()
    };
    const prisma = {
      feeConfig: {
        findUnique: jest.fn(({ where }: { where: { key: string } }) =>
          Promise.resolve(rows[where.key] ? { key: where.key, config: rows[where.key] } : null)
        ),
        findMany: jest.fn(),
        upsert: jest.fn()
      },
      auditLog: { create: jest.fn() }
    };
    const config = { get: jest.fn((_key: string, fallback: string) => fallback) };
    return new PricingService(prisma as never, redis as never, config as never);
  };

  it("calculates NGN transfer fixed fee from active config", async () => {
    const service = createService({
      ngn_transfer: { fee: { mode: "fixed", fixedFee: 125 } }
    });

    await expect(service.calculateNgnTransferFee(1000)).resolves.toBe(125);
  });

  it("calculates percentage fees with min and max caps", async () => {
    const service = createService({
      ngn_transfer: {
        fee: {
          mode: "percentage",
          percentageBps: 100,
          minFee: 75,
          maxFee: 120
        }
      }
    });

    await expect(service.calculateNgnTransferFee(1000)).resolves.toBe(75);
    await expect(service.calculateNgnTransferFee(10000)).resolves.toBe(100);
    await expect(service.calculateNgnTransferFee(20000)).resolves.toBe(120);
  });

  it("calculates FX payout totals from fixed and percentage fee rules", async () => {
    const service = createService({
      usd_transfer: {
        fxRate: 1650,
        providerFee: { mode: "fixed", fixedFee: 2500 },
        tfFee: { mode: "percentage", percentageBps: 100, minFee: 500, maxFee: 1200 },
        estimatedSettlementTime: "1-3 business days"
      }
    });

    await expect(service.getFxPricing("USD", 100)).resolves.toMatchObject({
      payoutCurrency: "USD",
      payoutAmount: 100,
      fxRate: 1650,
      providerFee: 2500,
      tfFee: 1200,
      totalNgnDebit: 168700
    });
  });

  it("calculates gift card total debit from configured rate and fee", async () => {
    const service = createService({
      gift_card: { usdFxRate: 1680, cnyFxRate: 230, fee: { mode: "fixed", fixedFee: 1000 } }
    });

    await expect(service.calculateGiftCardDebit("USD", 50)).resolves.toEqual({
      fee: 1000,
      fxRate: 1680,
      totalNgnDebit: 85000
    });
  });
});
