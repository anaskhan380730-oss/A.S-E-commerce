type ProductImageSource = {
  slug?: string;
  name?: string;
  images?: unknown;
};

const genericTrouserImages = [
  '/products/beige-embroidered-trousers.png',
  '/products/white-embroidered-trousers.png',
  '/products/white-trousers-juttis.png',
  '/products/white-lace-trousers.png',
  '/products/cream-ensemble-khussa.png',
  '/products/cream-trousers-juttis.png',
];

export function getProductImages(product: ProductImageSource): string[] {
  const saved = Array.isArray(product.images)
    ? product.images.filter((image): image is string => typeof image === 'string' && image.length > 0)
    : [];
  if (saved.length) return saved;

  const label = `${product.slug ?? ''} ${product.name ?? ''}`.toLowerCase();
  if (!label.includes('trouser') && !label.includes('palazzo')) return [];
  if (label.includes('black')) return ['/products/black-kurta-palazzo.png'];
  if (label.includes('white') && label.includes('lace')) return ['/products/white-lace-trousers.png'];
  if (label.includes('white') && (label.includes('jutti') || label.includes('khussa'))) return ['/products/white-trousers-juttis.png'];
  if (label.includes('white')) return ['/products/white-embroidered-trousers.png'];
  if (label.includes('beige')) return ['/products/beige-embroidered-trousers.png'];
  if (label.includes('cream') && label.includes('jutti')) return ['/products/cream-trousers-juttis.png'];
  if (label.includes('cream') && label.includes('khussa')) return ['/products/cream-ensemble-khussa.png'];
  if (label.includes('embroidered') || label.includes('trouser')) return genericTrouserImages;
  return [];
}
