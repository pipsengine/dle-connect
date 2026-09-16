import type { LucideIcon } from 'lucide-react';

export default function InternshipKpiCard({
  label,
  value,
  sub,
  Icon,
}: {
  label: string;
  value: string | number;
  sub: string;
  Icon: LucideIcon;
}) {
  return (
    <div className="kpi">
      <div className="kpiIcon">
        <Icon />
      </div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{sub}</small>
      </div>
    </div>
  );
}
