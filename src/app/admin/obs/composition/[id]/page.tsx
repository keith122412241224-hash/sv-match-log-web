import { CompositionObs } from "@/components/creator/CompositionObs";
export const metadata = { title: "OBS 表示セット", robots: { index: false, follow: false } };
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ transparent?: string; view?: string | string[] }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  return <CompositionObs id={id} transparent={query.transparent === "1"} view={query.view} />;
}
