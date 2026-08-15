import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { createShippingOptionsWorkflow } from "@medusajs/medusa/core-flows";

const PRINTFUL_PROVIDER = "printful_printful";

export default async function enablePrintful({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const link = container.resolve(ContainerRegistrationKeys.LINK);

  const { data: locations } = await query.graph({
    entity: "stock_location",
    fields: ["id", "name"],
  });
  const location = locations[0];
  if (!location) {
    logger.warn("No stock location — skip Printful shipping setup.");
    return;
  }

  await link.create({
    [Modules.STOCK_LOCATION]: { stock_location_id: location.id },
    [Modules.FULFILLMENT]: { fulfillment_provider_id: PRINTFUL_PROVIDER },
  });
  logger.info(`Linked ${PRINTFUL_PROVIDER} to ${location.name}`);

  const { data: existing } = await query.graph({
    entity: "shipping_option",
    fields: ["id", "name", "provider_id"],
    filters: { provider_id: PRINTFUL_PROVIDER },
  });
  if (existing.length) {
    logger.info("Printful shipping option already exists.");
    return;
  }

  const { data: profiles } = await query.graph({
    entity: "shipping_profile",
    fields: ["id"],
  });
  const { data: sets } = await query.graph({
    entity: "fulfillment_set",
    fields: ["id", "service_zones.id"],
  });
  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id"],
  });
  const zoneId = sets[0]?.service_zones?.[0]?.id;
  const profileId = profiles[0]?.id;
  const regionId = regions[0]?.id;
  if (!zoneId || !profileId || !regionId) {
    logger.warn("Missing fulfillment set, shipping profile, or region.");
    return;
  }

  await createShippingOptionsWorkflow(container).run({
    input: [
      {
        name: "Printful Standard",
        price_type: "flat",
        provider_id: PRINTFUL_PROVIDER,
        service_zone_id: zoneId,
        shipping_profile_id: profileId,
        type: {
          label: "Standard",
          description: "Printful calculated shipping.",
          code: "standard",
        },
        prices: [
          { currency_code: "eur", amount: 8 },
          { currency_code: "usd", amount: 8 },
          { region_id: regionId, amount: 8 },
        ],
        rules: [
          { attribute: "enabled_in_store", value: "true", operator: "eq" },
          { attribute: "is_return", value: "false", operator: "eq" },
        ],
      },
    ],
  });
  logger.info("Created Printful Standard shipping option.");
}
