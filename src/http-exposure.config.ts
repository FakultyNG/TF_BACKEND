import { timingSafeEqual } from "crypto";

export interface ConfigReader {
  get<T = string>(key: string, defaultValue?: T): T;
}

export interface SwaggerExposureOptions {
  enabled: boolean;
  basicAuthEnabled: boolean;
  username?: string;
  password?: string;
}

const isDevelopment = (nodeEnv?: string) => (nodeEnv ?? "development") === "development";

const readBoolean = (value: string | undefined, defaultValue: boolean) => {
  if (value === undefined) {
    return defaultValue;
  }
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
};

const secureCompare = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
};

export const getRootRouteHintsEnabled = (config: ConfigReader) => {
  const nodeEnv = config.get<string>("NODE_ENV", "development");

  return readBoolean(config.get<string | undefined>("ROOT_ROUTE_HINTS_ENABLED"), isDevelopment(nodeEnv));
};

export const getRootStatusData = (nodeEnv: string | undefined, apiPrefix: string, routeHintsEnabled?: boolean) => {
  const data: Record<string, string> = {
    service: "tf-backend"
  };

  if (routeHintsEnabled ?? isDevelopment(nodeEnv)) {
    data.docs = `/${apiPrefix}/docs`;
    data.health = `/${apiPrefix}/health`;
  }

  return data;
};

export const getSwaggerExposureOptions = (config: ConfigReader): SwaggerExposureOptions => {
  const nodeEnv = config.get<string>("NODE_ENV", "development");

  return {
    enabled: readBoolean(config.get<string | undefined>("SWAGGER_ENABLED"), !isDevelopment(nodeEnv) ? false : true),
    basicAuthEnabled: readBoolean(
      config.get<string | undefined>("SWAGGER_BASIC_AUTH_ENABLED"),
      !isDevelopment(nodeEnv)
    ),
    username: config.get<string | undefined>("SWAGGER_USERNAME"),
    password: config.get<string | undefined>("SWAGGER_PASSWORD")
  };
};

export const isSwaggerRequestAuthorized = (
  authorizationHeader: string | undefined,
  options: SwaggerExposureOptions
) => {
  if (!options.basicAuthEnabled) {
    return true;
  }

  if (!options.username || !options.password || !authorizationHeader?.startsWith("Basic ")) {
    return false;
  }

  const encodedCredentials = authorizationHeader.slice("Basic ".length);
  const decodedCredentials = Buffer.from(encodedCredentials, "base64").toString("utf8");
  const separatorIndex = decodedCredentials.indexOf(":");

  if (separatorIndex === -1) {
    return false;
  }

  const username = decodedCredentials.slice(0, separatorIndex);
  const password = decodedCredentials.slice(separatorIndex + 1);

  return secureCompare(username, options.username) && secureCompare(password, options.password);
};
