import { CanActivate, ExecutionContext, HttpStatus, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ADMIN_PERMISSIONS_KEY } from "../../common/decorators/admin-permissions.decorator";
import { ApiException } from "../../common/errors/api.exception";
import { AdminPermission, permissionsFor } from "../../admin/admin-permissions";

@Injectable()
export class AdminPermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AdminPermission[]>(ADMIN_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (!required?.length) return true;
    const admin = context.switchToHttp().getRequest().user as {
      role?: string;
      permissions?: string[];
      adminActive?: boolean;
    };
    if (admin?.adminActive === false) {
      throw new ApiException("Admin account is disabled", "ADMIN_DISABLED", HttpStatus.FORBIDDEN);
    }
    const available = permissionsFor(admin?.role ?? "", admin?.permissions);
    if (!required.every((permission) => available.includes(permission))) {
      throw new ApiException("You do not have permission to perform this action", "ADMIN_PERMISSION_DENIED", HttpStatus.FORBIDDEN);
    }
    return true;
  }
}
