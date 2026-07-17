import SurfaceView from "./surface/components/SurfaceView";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ s?: string }>;
}) {
  const { s } = await searchParams;
  return <SurfaceView initialTicker={s?.toUpperCase() ?? "SPY"} />;
}
