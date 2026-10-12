import { ApiError } from "../lib/errors";
import type { AccountUser } from "./auth-sessions";

export function assertPlatformManagement(
  actor: AccountUser,
  target: AccountUser,
  role?: string | null,
) {
  if (!actor.platformRole)
    throw new ApiError(
      403,
      "PERMISSION_DENIED",
      "Platform account management is restricted",
    );
  if (actor.id === target.id)
    throw new ApiError(
      403,
      "SELF_MANAGEMENT_DENIED",
      "Use another authorized administrator to change your platform access",
    );
  if (actor.platformRole === "super_admin") return;
  if (actor.platformRole === "moderator") {
    if (target.platformRole || role !== undefined)
      throw new ApiError(
        403,
        "PERMISSION_DENIED",
        "Moderators cannot grant roles or manage privileged accounts",
      );
    return;
  }
  if (
    target.platformRole === "admin" ||
    target.platformRole === "super_admin" ||
    role === "admin" ||
    role === "super_admin"
  ) {
    throw new ApiError(
      403,
      "PERMISSION_DENIED",
      "Only a Super Admin can manage administrators",
    );
  }
}
export function assertLastOwner(
  existingRole: string,
  nextRole: string,
  activeOwners: number,
) {
  if (
    existingRole === "organization_owner" &&
    nextRole !== existingRole &&
    activeOwners <= 1
  ) {
    throw new ApiError(
      409,
      "LAST_OWNER_PROTECTED",
      "Assign another organization owner before changing this role",
    );
  }
}
export function assertLastSuperAdmin(
  target: AccountUser,
  removesAccess: boolean,
  activeCount: number,
) {
  if (
    target.platformRole === "super_admin" &&
    target.status === "active" &&
    removesAccess &&
    activeCount <= 1
  ) {
    throw new ApiError(
      409,
      "LAST_SUPER_ADMIN_PROTECTED",
      "Keep at least one active Super Admin",
    );
  }
}
