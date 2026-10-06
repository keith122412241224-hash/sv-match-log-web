import { CorrelationObs } from "@/components/creator/CorrelationObs";
export const metadata = { title: "OBS 環境解説セット", robots: { index: false, follow: false } };
export default async function SetObsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ transparent?: string }> }) {
  const [{ id },query] = await Promise.all([params,searchParams]);
  return <CorrelationObs tierId={id} transparent={query.transparent === "1"} />;
}
