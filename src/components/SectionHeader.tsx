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

/** Titre de section sans icône. Utilise font-display (Fraunces) pour tous les H2/H3.
 * À préférer aux h2/h3 bruts pour garantir la cohérence typographique. */
export function SectionTitle({
  children,
  as: Tag = "h2",
  className = "",
}: {
  children: string;
  as?: "h2" | "h3";
  className?: string;
}) {
  return (
    <Tag className={`font-display text-lg font-semibold text-ink-900 ${className}`}>
      {children}
    </Tag>
  );
}
