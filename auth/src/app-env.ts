import type { AuthStore } from "./store/types";
import type { RateLimit } from "./lib/rate-limit";
import type { SigningMaterial } from "./lib/jwt";

export type AuthBindings = Cloudflare.Env;

export type AuthVariables = {
  store: AuthStore;
  limit: RateLimit;
  signing: SigningMaterial;
};

export type AppEnv = {
  Bindings: AuthBindings;
  Variables: AuthVariables;
};
