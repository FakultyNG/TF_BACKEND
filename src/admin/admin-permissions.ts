export const ADMIN_PERMISSIONS = [
  "dashboard.view",
  "users.view",
  "users.manage",
  "wallets.view",
  "wallets.manage",
  "transactions.view",
  "transactions.manage",
  "kyc.view",
  "kyc.manage",
  "support.view",
  "support.reply",
  "notifications.view",
  "notifications.send",
  "fees.view",
  "fees.manage",
  "audit.view",
  "admins.manage"
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

export const ROLE_DEFAULT_PERMISSIONS: Record<string, AdminPermission[]> = {
  SUPER_ADMIN: [...ADMIN_PERMISSIONS],
  ADMIN: [
    "dashboard.view", "users.view", "users.manage", "wallets.view", "transactions.view",
    "kyc.view", "kyc.manage", "support.view", "support.reply", "notifications.view", "notifications.send",
    "fees.view", "audit.view"
  ],
  SUPPORT: ["dashboard.view", "users.view", "wallets.view", "transactions.view", "support.view", "support.reply", "notifications.view"],
  COMPLIANCE: ["dashboard.view", "users.view", "users.manage", "wallets.view", "transactions.view", "kyc.view", "kyc.manage", "support.view", "audit.view"],
  FINANCE: ["dashboard.view", "users.view", "wallets.view", "wallets.manage", "transactions.view", "transactions.manage", "fees.view", "fees.manage", "audit.view"]
};

export function permissionsFor(role: string, assigned?: string[] | null): string[] {
  if (role === "SUPER_ADMIN") return [...ADMIN_PERMISSIONS];
  return assigned?.length ? assigned : (ROLE_DEFAULT_PERMISSIONS[role] ?? []);
}
