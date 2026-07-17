import ChainView from "./components/ChainView";

export default async function ChainPage({
  searchParams,
}: {
  searchParams: Promise<{ s?: string; expiry?: string; strike?: string }>;
}) {
  const { s, expiry, strike } = await searchParams;
  return (
    <ChainView
      initialTicker={s?.toUpperCase() ?? "SPY"}
      initialExpiry={expiry}
      initialStrike={strike ? Number(strike) : undefined}
    />
  );
}
