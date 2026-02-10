interface RiskBadgeProps {
  riskLevel: string;
  riskScore: number;
  compact?: boolean;
}

const riskColors: Record<string, string> = {
  low: "bg-green-100 text-green-800",
  medium: "bg-amber-100 text-amber-800",
  high: "bg-red-100 text-red-800",
};

const RiskBadge = ({ riskLevel, riskScore, compact }: RiskBadgeProps) => {
  if (riskLevel === "low" && riskScore === 0) return null;

  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${riskColors[riskLevel] || riskColors.low}`}>
      {compact ? riskLevel : `${riskLevel} (${riskScore})`}
    </span>
  );
};

export default RiskBadge;
