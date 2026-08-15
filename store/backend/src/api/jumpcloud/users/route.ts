import { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { z } from "@medusajs/framework/zod";
import { createJumpCloudUserWorkflow } from "../../../workflows/create-jumpcloud-user";

export const CreateJumpCloudUserSchema = z.object({
  email: z.string(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
});

type CreateJumpCloudUserBody = z.infer<typeof CreateJumpCloudUserSchema>;

export const POST = async (
  req: AuthenticatedMedusaRequest<CreateJumpCloudUserBody>,
  res: MedusaResponse,
) => {
  const { result } = await createJumpCloudUserWorkflow(req.scope).run({
    input: {
      email: req.validatedBody.email,
      auth_identity_id: req.auth_context.auth_identity_id,
      first_name: req.validatedBody.first_name,
      last_name: req.validatedBody.last_name,
    },
  });

  return res.status(200).json({ user: result.user });
};
