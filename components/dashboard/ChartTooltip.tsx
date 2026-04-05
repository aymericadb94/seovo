"use client";

export default function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#111] border border-white/10 rounded-xl px-4 py-3 shadow-xl">
      <p className="text-gray-400 text-xs mb-1">{label}</p>
      <p className="text-orange-400 font-black text-lg">{payload[0].value}</p>
      <p className="text-gray-500 text-xs">article{payload[0].value > 1 ? "s" : ""} publié{payload[0].value > 1 ? "s" : ""}</p>
    </div>
  );
}
