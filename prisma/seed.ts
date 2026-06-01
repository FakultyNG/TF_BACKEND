import { GiftCardProductStatus, PrismaClient, UserRole } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const phoneNumber = process.env.ADMIN_PHONE_NUMBER || "2348000000000";
  const passcode = process.env.ADMIN_PASSCODE || "12345";
  const passcodeHash = await bcrypt.hash(passcode, 12);

  await prisma.user.upsert({
    where: { phoneNumber },
    update: { role: UserRole.SUPER_ADMIN, passcodeHash },
    create: {
      phoneNumber,
      passcodeHash,
      role: UserRole.SUPER_ADMIN,
      profile: {
        create: {
          firstName: "Transfa",
          lastName: "Admin",
          country: "Nigeria"
        }
      }
    }
  });

  await prisma.giftCardProduct.upsert({
    where: { id: "gift_reeplay_usd" },
    update: {
      name: "Reeplay Gift Card",
      currency: "USD",
      minAmount: 10,
      maxAmount: 500,
      status: GiftCardProductStatus.active,
      provider: "mock"
    },
    create: {
      id: "gift_reeplay_usd",
      name: "Reeplay Gift Card",
      currency: "USD",
      minAmount: 10,
      maxAmount: 500,
      status: GiftCardProductStatus.active,
      provider: "mock"
    }
  });

  await prisma.giftCardProduct.upsert({
    where: { id: "gift_amazon_usd" },
    update: {
      name: "Amazon Gift Card",
      currency: "USD",
      minAmount: 5,
      maxAmount: 1000,
      status: GiftCardProductStatus.active,
      provider: "mock"
    },
    create: {
      id: "gift_amazon_usd",
      name: "Amazon Gift Card",
      currency: "USD",
      minAmount: 5,
      maxAmount: 1000,
      status: GiftCardProductStatus.active,
      provider: "mock"
    }
  });

  await prisma.feeConfig.upsert({
    where: { key: "ngn_transfer" },
    update: {
      config: {
        fee: {
          mode: "fixed",
          fixedFee: Number(process.env.NGN_TRANSFER_FIXED_FEE || "100")
        }
      },
      description: "NGN bank transfer fee rule"
    },
    create: {
      key: "ngn_transfer",
      config: {
        fee: {
          mode: "fixed",
          fixedFee: Number(process.env.NGN_TRANSFER_FIXED_FEE || "100")
        }
      },
      description: "NGN bank transfer fee rule"
    }
  });

  await prisma.feeConfig.upsert({
    where: { key: "usd_transfer" },
    update: {
      config: {
        fxRate: Number(process.env.USD_MOCK_FX_RATE || "1650"),
        providerFee: { mode: "fixed", fixedFee: Number(process.env.USD_PROVIDER_FEE_NGN || "2500") },
        tfFee: { mode: "fixed", fixedFee: Number(process.env.USD_TF_FEE_NGN || "1500") },
        estimatedSettlementTime: process.env.USD_SETTLEMENT_TIME || "1-3 business days"
      },
      description: "USD supplier payout pricing rule"
    },
    create: {
      key: "usd_transfer",
      config: {
        fxRate: Number(process.env.USD_MOCK_FX_RATE || "1650"),
        providerFee: { mode: "fixed", fixedFee: Number(process.env.USD_PROVIDER_FEE_NGN || "2500") },
        tfFee: { mode: "fixed", fixedFee: Number(process.env.USD_TF_FEE_NGN || "1500") },
        estimatedSettlementTime: process.env.USD_SETTLEMENT_TIME || "1-3 business days"
      },
      description: "USD supplier payout pricing rule"
    }
  });

  await prisma.feeConfig.upsert({
    where: { key: "cny_transfer" },
    update: {
      config: {
        fxRate: Number(process.env.CNY_MOCK_FX_RATE || "230"),
        providerFee: { mode: "fixed", fixedFee: Number(process.env.CNY_PROVIDER_FEE_NGN || "3000") },
        tfFee: { mode: "fixed", fixedFee: Number(process.env.CNY_TF_FEE_NGN || "2500") },
        estimatedSettlementTime: process.env.CNY_SETTLEMENT_TIME || "1-3 business days"
      },
      description: "CNY supplier payout pricing rule"
    },
    create: {
      key: "cny_transfer",
      config: {
        fxRate: Number(process.env.CNY_MOCK_FX_RATE || "230"),
        providerFee: { mode: "fixed", fixedFee: Number(process.env.CNY_PROVIDER_FEE_NGN || "3000") },
        tfFee: { mode: "fixed", fixedFee: Number(process.env.CNY_TF_FEE_NGN || "2500") },
        estimatedSettlementTime: process.env.CNY_SETTLEMENT_TIME || "1-3 business days"
      },
      description: "CNY supplier payout pricing rule"
    }
  });

  await prisma.feeConfig.upsert({
    where: { key: "gift_card" },
    update: {
      config: {
        usdFxRate: Number(process.env.GIFT_CARD_USD_FX_RATE || "1680"),
        cnyFxRate: Number(process.env.GIFT_CARD_CNY_FX_RATE || "230"),
        fee: { mode: "fixed", fixedFee: Number(process.env.GIFT_CARD_FEE_NGN || "1000") }
      },
      description: "Gift card purchase pricing rule"
    },
    create: {
      key: "gift_card",
      config: {
        usdFxRate: Number(process.env.GIFT_CARD_USD_FX_RATE || "1680"),
        cnyFxRate: Number(process.env.GIFT_CARD_CNY_FX_RATE || "230"),
        fee: { mode: "fixed", fixedFee: Number(process.env.GIFT_CARD_FEE_NGN || "1000") }
      },
      description: "Gift card purchase pricing rule"
    }
  });
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
