import { redirect } from "next/navigation";
import { requireCreatorPage } from "@/lib/creator/server";

export const metadata = { title: "クリエイターツール", robots: { index: false, follow: false } };
export default async function CreatorPage() {
  await requireCreatorPage();
  redirect("/admin?section=tools");
}
