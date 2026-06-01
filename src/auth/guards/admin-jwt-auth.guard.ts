import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { AuthService } from "../auth.service";

@Injectable()
export class AdminJwtAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const header = request.headers.authorization as string | undefined;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    const user = await this.authService.validateAccessToken(token ?? "", true);
    request.user = user;
    return true;
  }
}
