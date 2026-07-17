import SurfaceView from "./components/SurfaceView";

export default async function SurfacePage({
  searchParams,
}: {
  searchParams: Promise<{ s?: string }>;
}) {
  const { s } = await searchParams;
  return <SurfaceView initialTicker={s?.toUpperCase() ?? "SPY"} />;
}
