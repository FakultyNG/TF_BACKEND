import { HealthController } from "../src/health/health.controller";
import {
  getRootStatusData,
  getRootRouteHintsEnabled,
  getSwaggerExposureOptions,
  isSwaggerRequestAuthorized
} from "../src/http-exposure.config";

const configFrom = (values: Record<string, string | undefined>) => ({
  get: <T = string>(key: string, defaultValue?: T): T => {
    const value = values[key];
    return (value === undefined ? defaultValue : value) as T;
  }
});

describe("HTTP exposure controls", () => {
  it("keeps health response minimal for public health checks", () => {
    expect(new HealthController().check()).toEqual({
      success: true,
      message: "Service is healthy",
      data: {
        status: "ok"
      }
    });
  });

  it("hides route hints from the root status response outside development", () => {
    expect(getRootStatusData("production", "api/v1")).toEqual({
      service: "tf-backend"
    });
  });

  it("can hide root route hints even when NODE_ENV remains development", () => {
    expect(
      getRootRouteHintsEnabled(
        configFrom({
          NODE_ENV: "development",
          ROOT_ROUTE_HINTS_ENABLED: "false"
        })
      )
    ).toBe(false);
  });

  it("disables Swagger by default in production", () => {
    expect(getSwaggerExposureOptions(configFrom({ NODE_ENV: "production" }))).toEqual({
      enabled: false,
      basicAuthEnabled: true,
      username: undefined,
      password: undefined
    });
  });

  it("can enable protected Swagger docs through env configuration", () => {
    expect(
      getSwaggerExposureOptions(
        configFrom({
          NODE_ENV: "staging",
          SWAGGER_ENABLED: "true",
          SWAGGER_BASIC_AUTH_ENABLED: "true",
          SWAGGER_USERNAME: "docs-user",
          SWAGGER_PASSWORD: "docs-pass"
        })
      )
    ).toEqual({
      enabled: true,
      basicAuthEnabled: true,
      username: "docs-user",
      password: "docs-pass"
    });
  });

  it("accepts only matching Swagger basic auth credentials", () => {
    const options = {
      enabled: true,
      basicAuthEnabled: true,
      username: "docs-user",
      password: "docs-pass"
    };
    const validHeader = `Basic ${Buffer.from("docs-user:docs-pass").toString("base64")}`;
    const invalidHeader = `Basic ${Buffer.from("docs-user:wrong").toString("base64")}`;

    expect(isSwaggerRequestAuthorized(validHeader, options)).toBe(true);
    expect(isSwaggerRequestAuthorized(invalidHeader, options)).toBe(false);
    expect(isSwaggerRequestAuthorized(undefined, options)).toBe(false);
  });
});
