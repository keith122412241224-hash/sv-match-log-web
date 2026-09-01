import { GuestApp } from "@/components/guest/GuestApp";
import { getActiveArchetypes, getInputEnabledEnvironments } from "@/lib/data";

export default async function GuestPage() {
  const [archetypes, environments] = await Promise.all([getActiveArchetypes(), getInputEnabledEnvironments()]);

  return <GuestApp archetypes={archetypes} environments={environments} />;
}
