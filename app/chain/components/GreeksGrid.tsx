"use client";

interface Props {
  fmtDelta: string;
  fmtGamma: string;
  fmtTheta: string;
  fmtVega:  string;
  fmtRho:   string;
  fmtVanna: string;
  fmtCharm: string;
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="label-caps mb-0.5">{label}</p>
      <p className="num text-sm text-[#E7E7EA]">{value}</p>
    </div>
  );
}

export default function GreeksGrid({ fmtDelta, fmtGamma, fmtTheta, fmtVega, fmtRho, fmtVanna, fmtCharm }: Props) {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-3">
      <Cell label="DELTA"     value={fmtDelta} />
      <Cell label="GAMMA"     value={fmtGamma} />
      <Cell label="THETA/DAY" value={fmtTheta} />
      <Cell label="VEGA"      value={fmtVega}  />
      <Cell label="RHO"       value={fmtRho}   />
      <Cell label="VANNA"     value={fmtVanna} />
      <Cell label="CHARM"     value={fmtCharm} />
    </div>
  );
}
