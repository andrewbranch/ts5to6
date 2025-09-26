// Import using paths mapping (baseUrl + paths)
import { Product } from "types";
import { formatCurrency, slugify } from "utils/format";
import { isPositiveNumber } from "utils/validation";

export function ProductCard(props: { product: Product }) {
  const { product } = props;

  if (!isPositiveNumber(product.price)) {
    throw new Error("Invalid price");
  }

  return {
    id: product.id,
    title: product.title,
    price: formatCurrency(product.price),
    slug: slugify(product.title),
  };
}
