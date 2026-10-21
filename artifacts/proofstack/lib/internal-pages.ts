// The design-system gallery and foundation status page are development tools.
// They are not part of the public product, so production returns 404 for them.
export function internalPagesHidden(
  env: string | undefined = process.env.NODE_ENV,
) {
  return env === "production";
}
