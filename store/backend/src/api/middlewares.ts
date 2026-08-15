import {
  authenticate,
  defineMiddlewares,
  validateAndTransformBody,
} from "@medusajs/framework/http";
import { CreateJumpCloudUserSchema } from "./jumpcloud/users/route";

export default defineMiddlewares({
  routes: [
    {
      matcher: "/jumpcloud/users",
      methods: ["POST"],
      middlewares: [
        authenticate("user", ["bearer", "session"], { allowUnregistered: true }),
        validateAndTransformBody(CreateJumpCloudUserSchema),
      ],
    },
  ],
});
