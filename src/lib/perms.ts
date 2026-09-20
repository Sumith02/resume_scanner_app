import type { User } from "../types";

export function can(user: User | null, permission: string): boolean {
  return !!user?.permissions?.includes(permission);
}

export function canAny(user: User | null, permissions: string[]): boolean {
  return permissions.some((p) => can(user, p));
}