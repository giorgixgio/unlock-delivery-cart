export const SUMMARY_UTC_CRON = "0 15 * * *";
export function summaryWindow(now = new Date()) {
  const day = new Date(now.getTime() + 4 * 3600000).toISOString().slice(0, 10);
  return { day, from: `${day}T00:00:00+04:00`, to: now.toISOString() };
}
export function isLeadCreation(status: string) { return status === "pending_details"; }
export interface OperatorRow {
  operator: string; first_activity: string | null; last_activity: string | null;
  calls: number; reviewed: number; confirmed: number; cancelled: number;
  no_answer: number; callback: number;
}
const time = (value: string | null) => value ? new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Tbilisi", hour: "2-digit", minute: "2-digit", hour12: false,
}).format(new Date(value)) : "—";
export function formatOperatorSummary(day: string, rows: OperatorRow[], to: string) {
  return `📊 ოპერატორების დღიური შეჯამება — ${day}\n00:00–${time(to)} · თბილისის დრო\n` +
    rows.map(r => `\n👤 ${r.operator}\nპირველი აქტივობა: ${time(r.first_activity)} · ბოლო: ${time(r.last_activity)}\n` +
      `📞 აღრიცხული ზარები: ${r.calls} · განხილული შეკვეთები: ${r.reviewed}\n` +
      `✅ დადასტურებული: ${r.confirmed} · ❌ გაუქმებული: ${r.cancelled}\n` +
      `📵 უპასუხო: ${r.no_answer} · 🔁 გადარეკვა: ${r.callback}`).join("\n") +
    `\n\nზარები ითვლება დაფიქსირებული შედეგებით, არა ტელეფონის რეალური კავშირის მიხედვით. პირველი აქტივობა არ არის შესვლის დრო.`;
}