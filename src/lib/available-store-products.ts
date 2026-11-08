/** Hide explicitly sold-out listings without guessing availability from raw stock counts. */
export function availableStoreProducts<T extends { in_stock?: boolean }>(products: T[]): T[] {
  return products.filter((product) => product.in_stock !== false);
}