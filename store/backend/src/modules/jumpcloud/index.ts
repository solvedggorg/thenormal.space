import { ModuleProvider, Modules } from "@medusajs/framework/utils";
import JumpCloudAuthService from "./service";

export default ModuleProvider(Modules.AUTH, {
  services: [JumpCloudAuthService],
});
