interface KPICardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
}

export default function KPICard({ label, value, subtitle, trend }: KPICardProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <p className="mb-1 text-xs font-medium text-clutch-grey/60">{label}</p>
      <p className="text-2xl font-bold text-clutch-black">{value}</p>
      {trend && (
        <p
          className={`mt-1 text-xs font-medium ${
            trend.isPositive ? "text-green-600" : "text-red-500"
          }`}
        >
          {trend.isPositive ? "+" : ""}
          {trend.value}%
        </p>
      )}
      {subtitle && (
        <p className="mt-1 text-[10px] text-clutch-grey/40">{subtitle}</p>
      )}
    </div>
  );
}
