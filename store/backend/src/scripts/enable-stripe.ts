import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { updateRegionsWorkflow } from "@medusajs/medusa/core-flows";

const STRIPE_PROVIDER = "pp_stripe_stripe";

export default async function enableStripe({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id", "name", "payment_providers.id"],
  });

  for (const region of regions) {
    const current = (region.payment_providers ?? [])
      .map((provider) => provider?.id)
      .filter((id): id is string => Boolean(id));
    if (current.includes(STRIPE_PROVIDER)) {
      logger.info(`Stripe already enabled on ${region.name}`);
      continue;
    }
    await updateRegionsWorkflow(container).run({
      input: {
        selector: { id: region.id },
        update: { payment_providers: [...new Set([...current, STRIPE_PROVIDER])] },
      },
    });
    logger.info(`Enabled Stripe on ${region.name}`);
  }
}
