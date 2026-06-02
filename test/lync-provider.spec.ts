import { ConfigService } from "@nestjs/config";
import { LyncClient } from "../src/providers/lync/lync.client";
import { getLyncConfig } from "../src/providers/lync/lync.config";
import { LyncConfigurationError } from "../src/providers/lync/lync.errors";
import { LyncMapper } from "../src/providers/lync/lync.mapper";
import { MockLyncProvider } from "../src/providers/lync/lync.service";
import { WalletService } from "../src/wallet/wallet.service";

const config = (values: Record<string, string | undefined>) =>
  ({
    get: jest.fn((key: string, defaultValue?: string) => values[key] ?? defaultValue)
  }) as unknown as ConfigService;

describe("Lync provider integration", () => {
  it("uses disabled mock Lync provider with stable mock references", async () => {
    const provider = new MockLyncProvider(config({}));

    const dva = await provider.createDedicatedVirtualAccount({
      userId: "user_1",
      phoneNumber: "2348000000000",
      firstName: "Ada",
      lastName: "Lovelace"
    });
    const transfer = await provider.submitTransfer({ reference: "txn_1" });
    const payout = await provider.submitPayout({ reference: "txn_usd_1", payoutCurrency: "USD" });

    expect(dva.provider).toBe("mock_lync");
    expect(dva.providerReference).toMatch(/^mock_dva_/);
    expect(transfer).toMatchObject({ provider: "mock_lync", providerReference: "mock_ngn_txn_1" });
    expect(payout).toMatchObject({ provider: "mock_lync", providerReference: "mock_usd_txn_usd_1" });
  });

  it("maps Lync DVA responses to normalized Transfa output", () => {
    const mapped = new LyncMapper().toDvaOutput({
      data: {
        id: "lnc_dva_1",
        bank_name: "Providus Bank",
        account_number: "1234567890",
        account_name: "TRANSFA ADA",
        status: "active"
      }
    });

    expect(mapped).toMatchObject({
      provider: "lync",
      providerReference: "lnc_dva_1",
      bankName: "Providus Bank",
      accountNumber: "1234567890",
      accountName: "TRANSFA ADA",
      status: "active"
    });
  });

  it("reads Lync live-mode config without hardcoding endpoint paths", () => {
    const lyncConfig = getLyncConfig(
      config({
        LYNC_ENABLED: "true",
        LYNC_ENV: "sandbox",
        LYNC_BASE_URL: "https://api.example.test",
        LYNC_CREATE_DVA_PATH: "/exact/create-dva"
      })
    );

    expect(lyncConfig.enabled).toBe(true);
    expect(lyncConfig.env).toBe("sandbox");
    expect(lyncConfig.paths.createDva).toBe("/exact/create-dva");
    expect(lyncConfig.paths.ngnTransfer).toBeUndefined();
  });

  it("throws a configuration error when live endpoint paths are missing", async () => {
    const client = new LyncClient(config({ LYNC_ENABLED: "true", LYNC_BASE_URL: "https://api.example.test" }));

    await expect(client.get("banks")).rejects.toBeInstanceOf(LyncConfigurationError);
  });

  it("masks sensitive provider log payload fields", async () => {
    const providerLog = { create: jest.fn().mockResolvedValue({ id: "log_1" }) };
    const service = new WalletService({ providerLog } as never, {} as never);

    await service.logProvider(
      "lync",
      "create_dva",
      "user_1",
      "lnc_1",
      "successful",
      { bvn: "12345678901", nested: { token: "secret-token", accountNumber: "1234567890" } },
      { ok: true }
    );

    expect(providerLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        requestPayload: {
          bvn: "***MASKED***",
          nested: {
            token: "***MASKED***",
            accountNumber: "1234567890"
          }
        }
      })
    });
  });
});
