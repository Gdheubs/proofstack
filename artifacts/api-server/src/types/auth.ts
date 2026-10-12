/**
 * Construct only after a managed identity provider verifies a session.
 * No request body, cookie parsed without verification, or identity header may
 * create this context. Phase 1 intentionally does not install an auth provider.
 */
export interface Principal {
  userId: string;
  authSubject: string;
}

declare module "express-serve-static-core" {
  interface Locals {
    principal?: Principal;
  }
}
