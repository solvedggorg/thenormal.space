export type ShopProduct = {
  handle: string;
  name: string;
  sentence: string;
  paragraph: string;
  href: string;
};

export const SHOP_PRODUCTS: ShopProduct[] = [
  {
    handle: "dishwasher",
    name: "Dishwasher",
    sentence: "Washes dishes. You put them in, you take them out.",
    paragraph: "Washes dishes. You put them in, you take them out.",
    href: "/product/dishwasher",
  },
  {
    handle: "washing-machine",
    name: "Washing Machine",
    sentence: "Washes clothes. Same idea.",
    paragraph: "Washes clothes. Same idea.",
    href: "/product/washing-machine",
  },
  {
    handle: "litter-box",
    name: "Litter Box",
    sentence: "Holds litter. You scoop it.",
    paragraph: "Holds litter. You scoop it. That is the product.",
    href: "/product/litter-box",
  },
];

export function shopProductByHandle(handle: string): ShopProduct | undefined {
  return SHOP_PRODUCTS.find((item) => item.handle === handle);
}
