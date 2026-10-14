import { ConfigService } from "@nestjs/config";
import { kycProviderFactory } from "../src/providers/providers.module";

const config = (provider?: string) => ({
  get: jest.fn((_key: string, fallback?: string) => provider ?? fallback)
}) as unknown as ConfigService;

describe("KYC provider selection", () => {
  const strowallet = { name: "strowallet" };
  const prembly = { name: "prembly" };
  const bytid = { name: "bytid" };
  const mock = { name: "mock" };

  it("keeps Strowallet as the default BVN provider", () => {
    expect(kycProviderFactory(config(), strowallet as never, prembly as never, bytid as never, mock as never)).toBe(strowallet);
  });

  it("selects BytID when KYC_PROVIDER=bytid", () => {
    expect(kycProviderFactory(config("bytid"), strowallet as never, prembly as never, bytid as never, mock as never)).toBe(bytid);
  });
});
