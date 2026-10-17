import { Reflector } from "@nestjs/core";
import { ADMIN_PERMISSIONS, permissionsFor } from "../src/admin/admin-permissions";
import { AdminPermissionsGuard } from "../src/auth/guards/admin-permissions.guard";

describe("admin feature permissions", () => {
  it("gives the environment super-admin every feature", () => {
    expect(permissionsFor("SUPER_ADMIN", [])).toEqual(ADMIN_PERMISSIONS);
  });

  it("enforces a selected feature permission", () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(["notifications.send"]) } as unknown as Reflector;
    const guard = new AdminPermissionsGuard(reflector);
    const context = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => ({ user: { role: "SUPPORT", permissions: ["support.view"] } }) })
    } as never;
    expect(() => guard.canActivate(context)).toThrow("permission");
  });

  it("allows an admin with the selected permission", () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(["support.reply"]) } as unknown as Reflector;
    const guard = new AdminPermissionsGuard(reflector);
    const context = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => ({ user: { role: "SUPPORT", permissions: ["support.reply"] } }) })
    } as never;
    expect(guard.canActivate(context)).toBe(true);
  });
});
