const API_BASE = (import.meta.env.VITE_API_BASE_URL || "/api/v1").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(message: string, readonly code?: string, readonly status?: number) {
    super(message);
  }
}

export const authStore = {
  get: () => sessionStorage.getItem("transfa_admin_token"),
  set: (token: string) => sessionStorage.setItem("transfa_admin_token", token),
  clear: () => sessionStorage.removeItem("transfa_admin_token")
};

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = authStore.get();
  const isForm = init.body instanceof FormData;
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(isForm ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers
    }
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success) {
    if (response.status === 401) authStore.clear();
    throw new ApiError(body?.message || "The request could not be completed", body?.error?.code, response.status);
  }
  return body.data as T;
}

export const formatMoney = (amount = 0, currency = "NGN") =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);

export const displayName = (profile?: { firstName?: string | null; lastName?: string | null } | null, fallback = "Transfa user") =>
  [profile?.firstName, profile?.lastName].filter(Boolean).join(" ") || fallback;
