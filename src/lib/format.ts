export function formatYuan(value: number): string {
  return `${value.toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} 元`;
}

export function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getMonth() + 1}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
