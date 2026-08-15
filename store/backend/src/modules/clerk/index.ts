import { ModuleProvider, Modules } from "@medusajs/framework/utils";
import ClerkAuthService from "./service";

export default ModuleProvider(Modules.AUTH, {
  services: [ClerkAuthService],
});
