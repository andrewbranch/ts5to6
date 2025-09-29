// Import using paths mapping (baseUrl + paths)
import { User } from "types";
import { formatCurrency } from "utils/format";
import { validateEmail } from "utils/validation";

export function UserCard(props: { user: User }) {
  const { user } = props;

  if (!validateEmail(user.email)) {
    throw new Error("Invalid email");
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    displayName: `${user.name} (${user.email})`,
  };
}
