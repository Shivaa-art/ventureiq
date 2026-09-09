import { cn } from "@/lib/utils";

interface ScoreDialProps {
  value: number;
  size?: number;
  stroke?: number;
  label?: string;
  className?: string;
}

export function ScoreDial({ value, size = 224, stroke = 10, label = "Opportunity Score", className }: ScoreDialProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (clamped / 100) * c;

  return (
    <div className={cn("relative", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="var(--color-border)"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="var(--color-primary)"
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.16,1,0.3,1)", filter: "drop-shadow(0 0 8px oklch(0.75 0.17 158 / 0.5))" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-6xl font-bold tracking-tighter tabular-nums">{clamped}</span>
        <span className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}