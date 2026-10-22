import { CompositionObs } from "@/components/creator/CompositionObs";
export const metadata = { title: "OBS 相関図", robots: { index: false, follow: false } };
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ transparent?: string }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  return <CompositionObs id={id} standalone transparent={query.transparent === "1"} />;
}
