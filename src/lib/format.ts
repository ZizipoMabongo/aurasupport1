import { format, formatDistanceToNow } from "date-fns";

export function fmt(dt: string | Date | null | undefined): string {
  if (!dt) return "—";
  try {
    const d = typeof dt === "string" ? new Date(dt) : dt;
    return format(d, "MMM d, yyyy h:mm a");
  } catch {
    return "—";
  }
}

export function rel(dt: string | Date | null | undefined): string {
  if (!dt) return "—";
  try {
    return formatDistanceToNow(typeof dt === "string" ? new Date(dt) : dt, { addSuffix: true });
  } catch {
    return "—";
  }
}

export function priorityClasses(p: string | null | undefined): string {
  switch (p) {
    case "Urgent": return "bg-destructive/10 text-destructive border-destructive/20";
    case "High": return "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-300";
    case "Medium": return "bg-primary/10 text-primary border-primary/20";
    default: return "bg-muted text-muted-foreground border-border";
  }
}

export function statusClasses(s: string | null | undefined): string {
  switch (s) {
    case "Resolved": return "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-300";
    case "Escalated": return "bg-destructive/10 text-destructive border-destructive/20";
    case "In Progress": return "bg-primary/10 text-primary border-primary/20";
    case "Rejected": return "bg-muted text-muted-foreground border-border";
    case "Needs Review": return "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-300";
    default: return "bg-secondary text-secondary-foreground border-border";
  }
}
