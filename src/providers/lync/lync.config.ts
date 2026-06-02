import { ConfigService } from "@nestjs/config";
import { LyncConfig, LyncEndpointKey } from "./lync.types";

const readBoolean = (value: string | undefined, defaultValue: boolean) => {
  if (value === undefined) return defaultValue;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
};

const readPath = (config: ConfigService, key: LyncEndpointKey, envKey: string) => config.get<string>(envKey);

export const getLyncConfig = (config: ConfigService): LyncConfig => ({
  enabled: readBoolean(config.get<string>("LYNC_ENABLED"), false),
  env: config.get<string>("LYNC_ENV", "sandbox"),
  baseUrl: config.get<string>("LYNC_BASE_URL"),
  apiKey: config.get<string>("LYNC_API_KEY"),
  secretKey: config.get<string>("LYNC_SECRET_KEY"),
  clientId: config.get<string>("LYNC_CLIENT_ID"),
  clientSecret: config.get<string>("LYNC_CLIENT_SECRET"),
  timeoutMs: Number(config.get<string>("LYNC_TIMEOUT_MS", "15000")),
  paths: {
    createDva: readPath(config, "createDva", "LYNC_CREATE_DVA_PATH"),
    getDva: readPath(config, "getDva", "LYNC_GET_DVA_PATH"),
    verifyFunding: readPath(config, "verifyFunding", "LYNC_VERIFY_FUNDING_PATH"),
    banks: readPath(config, "banks", "LYNC_BANKS_PATH"),
    resolveAccount: readPath(config, "resolveAccount", "LYNC_RESOLVE_ACCOUNT_PATH"),
    ngnTransfer: readPath(config, "ngnTransfer", "LYNC_NGN_TRANSFER_PATH"),
    fxQuote: readPath(config, "fxQuote", "LYNC_FX_QUOTE_PATH"),
    fxPayout: readPath(config, "fxPayout", "LYNC_FX_PAYOUT_PATH"),
    receipt: readPath(config, "receipt", "LYNC_RECEIPT_PATH")
  }
});
