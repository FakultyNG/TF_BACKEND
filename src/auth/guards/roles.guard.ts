import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { UserRole } from "@prisma/client";
import { ROLES_KEY } from "../../common/decorators/roles.decorator";
import { permissionsFor } from "../../admin/admin-permissions";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (!required?.length) return true;
    const request = context.switchToHttp().getRequest();
    if (!required.includes(request.user?.role)) return false;
    if (request.user?.role === UserRole.SUPER_ADMIN) return true;
    const permission = this.permissionForRequest(request.method, request.originalUrl ?? request.url ?? "");
    if (!permission) return true;
    return permissionsFor(request.user?.role ?? "", request.user?.permissions).includes(permission);
  }

  private permissionForRequest(method: string, rawUrl: string) {
    const url = rawUrl.split("?")[0];
    const write = !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
    if (/\/admin\/admins(?:\/|$)/.test(url)) return "admins.manage";
    if (/\/admin\/support(?:\/|$)/.test(url)) return write ? "support.reply" : "support.view";
    if (/\/admin\/notifications(?:\/|$)/.test(url)) return write ? "notifications.send" : "notifications.view";
    if (/\/admin\/(?:kyc-records)(?:\/|$)/.test(url)) return write ? "kyc.manage" : "kyc.view";
    if (/\/admin\/(?:transactions|transfers|gift-cards)(?:\/|$)/.test(url)) return write ? "transactions.manage" : "transactions.view";
    if (/\/admin\/(?:dva)(?:\/|$)/.test(url) || /\/admin\/users\/[^/]+\/wallet(?:\/|$)/.test(url)) return write ? "wallets.manage" : "wallets.view";
    if (/\/admin\/fees(?:\/|$)/.test(url)) return write ? "fees.manage" : "fees.view";
    if (/\/admin\/(?:audit-logs|auth-sessions)(?:\/|$)/.test(url)) return "audit.view";
    if (/\/admin\/users(?:\/|$)/.test(url)) return write ? "users.manage" : "users.view";
    if (/\/admin\/dashboard(?:\/|$)/.test(url)) return "dashboard.view";
    return undefined;
  }
}
