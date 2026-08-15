import {
  AuthenticationInput,
  AuthenticationResponse,
  AuthIdentityProviderService,
  Logger,
} from "@medusajs/framework/types";
import { AbstractAuthModuleProvider } from "@medusajs/framework/utils";
import {
  GENERIC_AUTH_ERROR,
  upsertAuthIdentity,
} from "../auth-shared";
import {
  fetchClerkUser,
  profileFromClerkClaims,
  profileFromClerkUser,
  tokenFromInput,
  userMetadataFromClerk,
  verifyClerkSessionToken,
  type ClerkOptions,
  type ClerkProfile,
} from "./session";

type InjectedDependencies = {
  logger: Logger;
};

class ClerkAuthService extends AbstractAuthModuleProvider {
  static identifier = "clerk";
  static DISPLAY_NAME = "Clerk";

  protected logger_: Logger;
  protected options_: ClerkOptions;

  static validateOptions(options: ClerkOptions): void {
    if (!options?.secretKey && !options?.jwtKey && !options?.issuer && !options?.publishableKey) {
      throw new Error("Clerk needs a secretKey, jwtKey, issuer, or publishableKey");
    }
  }

  constructor({ logger }: InjectedDependencies, options: ClerkOptions) {
    // @ts-expect-error Medusa provider constructor
    super(...arguments);
    this.logger_ = logger;
    this.options_ = options;
  }

  async register(
    data: AuthenticationInput,
    authIdentityService: AuthIdentityProviderService,
  ): Promise<AuthenticationResponse> {
    return this.authenticate(data, authIdentityService);
  }

  async authenticate(
    data: AuthenticationInput,
    authIdentityService: AuthIdentityProviderService,
  ): Promise<AuthenticationResponse> {
    return this.verifySession_(data, authIdentityService);
  }

  async validateCallback(
    data: AuthenticationInput,
    authIdentityService: AuthIdentityProviderService,
  ): Promise<AuthenticationResponse> {
    return this.verifySession_(data, authIdentityService);
  }

  protected async verifySession_(
    data: AuthenticationInput,
    authIdentityService: AuthIdentityProviderService,
  ): Promise<AuthenticationResponse> {
    const token = tokenFromInput(data);
    if (!token) {
      return { success: false, error: "No Clerk session token provided" };
    }
    try {
      const claims = await verifyClerkSessionToken(token, this.options_);
      const fromToken = profileFromClerkClaims(claims);
      if (!fromToken.entityId) {
        return { success: false, error: GENERIC_AUTH_ERROR };
      }
      const profile = await this.completeProfile_(fromToken);
      if (!profile.email) {
        return { success: false, error: "Clerk session has no email" };
      }
      const authIdentity = await upsertAuthIdentity(
        authIdentityService,
        profile.entityId,
        userMetadataFromClerk(profile),
      );
      return { success: true, authIdentity };
    } catch (error) {
      this.logger_?.error(`Clerk authentication error: ${error?.message || error}`);
      return { success: false, error: GENERIC_AUTH_ERROR };
    }
  }

  protected async completeProfile_(fromToken: ClerkProfile): Promise<ClerkProfile> {
    if (fromToken.email) return fromToken;
    const user = await fetchClerkUser(fromToken.entityId, this.options_);
    if (!user) return fromToken;
    const fromApi = profileFromClerkUser(user);
    return {
      entityId: fromToken.entityId,
      email: fromApi.email || "",
      first_name: fromToken.first_name || fromApi.first_name,
      last_name: fromToken.last_name || fromApi.last_name,
      name: fromToken.name || fromApi.name,
    };
  }
}

export default ClerkAuthService;
