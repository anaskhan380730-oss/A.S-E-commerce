export type StorefrontVariant = {
  id: string;
  color: string | null;
  size: string | null;
  stock: number;
  active: boolean;
};

export type StorefrontProduct = {
  id: string;
  name: string;
  slug: string;
  price: number;
  compareAtPrice?: number | null;
  priceUsdCents?: number | null;
  compareAtPriceUsdCents?: number | null;
  isNew?: boolean;
  images?: unknown;
  colors?: unknown;
  sizes?: unknown;
  variants?: StorefrontVariant[];
  category?: { id?: string; name: string; slug?: string; description?: string | null } | null;
};

export type ProductDetailsRecord = StorefrontProduct & {
  sku: string;
  description: string;
  customMeasurements: boolean | null;
  colors: string[];
  sizes: string[];
  variants: StorefrontVariant[];
  category: {
    id: string;
    name: string;
    slug: string;
    measurementFields: unknown;
    customMeasurements: boolean | null;
  };
};
