import { GuestApp } from "@/components/guest/GuestApp";
import { getActiveArchetypes, getEnvironments } from "@/lib/data";

export default async function GuestPage() {
  const [archetypes, environments] = await Promise.all([getActiveArchetypes(), getEnvironments()]);

  return <GuestApp archetypes={archetypes} environments={environments} />;
}
