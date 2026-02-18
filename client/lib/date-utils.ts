export function todayLocalISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isToday(dateStr: string): boolean {
  return dateStr === todayLocalISO();
}

export function formatTaskDateLabel(dateStr: string): string {
  if (isToday(dateStr)) return "Today's Tasks";
  const d = new Date(dateStr + "T12:00:00");
  return (
    d.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    }) + " - Tasks"
  );
}
