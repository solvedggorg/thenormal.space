import { SHOP_PRODUCTS, shopProductByHandle, type ShopProduct } from "../../../shared/shop";

export type CatalogResponse = {
  source: "medusa" | "catalog";
  products: ShopProduct[];
};

export function publicApiUrl(): string {
  return (import.meta.env.PUBLIC_API_URL || "").replace(/\/$/, "");
}

export function shopIsLive(): boolean {
  return publicApiUrl().length > 0;
}

export async function loadCatalog(): Promise<CatalogResponse> {
  const base = publicApiUrl();
  if (!base) return { source: "catalog", products: SHOP_PRODUCTS };
  try {
    const response = await fetch(`${base}/shop/products`);
    if (!response.ok) return { source: "catalog", products: SHOP_PRODUCTS };
    return (await response.json()) as CatalogResponse;
  } catch {
    return { source: "catalog", products: SHOP_PRODUCTS };
  }
}

export async function loadProduct(handle: string): Promise<ShopProduct | undefined> {
  const base = publicApiUrl();
  if (base) {
    try {
      const response = await fetch(`${base}/shop/products/${encodeURIComponent(handle)}`);
      if (response.ok) {
        const body = (await response.json()) as { product?: ShopProduct };
        if (body.product) return body.product;
      }
    } catch {
      // fall through to the static catalog
    }
  }
  return shopProductByHandle(handle);
}
