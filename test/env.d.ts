declare module "cloudflare:test" {
  // This is the declaration-merging hook cloudflare:test requires. It exists to
  // bind ProvidedEnv to the generated Env and has no members of its own, which
  // is exactly what no-empty-object-type flags.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface ProvidedEnv extends Env {}
}
