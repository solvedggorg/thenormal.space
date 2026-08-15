export type ShopCartLine = {
  handle: string;
  name: string;
  quantity: number;
  variant_id?: string;
};

const STORAGE_KEY = "thenormal-shop-cart";

export function readShopCart(): ShopCartLine[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ShopCartLine[]) : [];
  } catch {
    return [];
  }
}

export function writeShopCart(lines: ShopCartLine[]): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
}

export function clearShopCart(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

export function addShopCartLine(line: ShopCartLine): ShopCartLine[] {
  const cart = readShopCart();
  const existing = cart.find((item) => item.handle === line.handle);
  if (existing) {
    existing.quantity += line.quantity;
    if (line.variant_id) existing.variant_id = line.variant_id;
  } else {
    cart.push(line);
  }
  writeShopCart(cart);
  return cart;
}
