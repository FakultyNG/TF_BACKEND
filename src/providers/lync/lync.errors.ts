export class LyncConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LyncConfigurationError";
  }
}

export class LyncProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly providerCode?: string,
    readonly retryable = false,
    readonly raw?: unknown
  ) {
    super(message);
    this.name = "LyncProviderError";
  }
}
