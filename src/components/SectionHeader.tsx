import type { LucideIcon } from "lucide-react";

export function SectionHeader({
  icon: Icon,
  title,
  as: Tag = "h2",
  className = "",
}: {
  icon: LucideIcon;
  title: string;
  as?: "h2" | "h3";
  className?: string;
}) {
  return (
    <Tag className={`flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-500 ${className}`}>
      <span className="inline-flex rounded-lg bg-accent-50 p-1.5 text-accent-400">
        <Icon className="h-3.5 w-3.5" />
      </span>
      {title}
    </Tag>
  );
}
