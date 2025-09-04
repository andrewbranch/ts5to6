// This file demonstrates BOTH baseUrl usage patterns:

// 1. Import using paths mapping (baseUrl + paths configuration)
import { ProductCard } from "components/ProductCard";
import { UserCard } from "components/UserCard";
import { Product, User } from "types";

// 2. Import using direct baseUrl resolution (non-relative imports resolved against baseUrl)
import { formatCurrency } from "utils/format"; // resolves to src/utils/format
import { validateEmail } from "utils/validation"; // resolves to src/utils/validation

export function App() {
  const sampleUser: User = {
    id: 1,
    name: "John Doe",
    email: "john@example.com",
  };

  const sampleProduct: Product = {
    id: 1,
    title: "Amazing Widget",
    price: 29.99,
  };

  // Use both components and utilities
  const userCard = UserCard({ user: sampleUser });
  const productCard = ProductCard({ product: sampleProduct });

  console.log("User:", userCard);
  console.log("Product:", productCard);
  console.log("Price formatted:", formatCurrency(sampleProduct.price));
  console.log("Email valid:", validateEmail(sampleUser.email));
}
