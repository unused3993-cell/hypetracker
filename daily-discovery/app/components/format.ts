export const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

export function issueNo(n: number) {
  return `No. ${String(n).padStart(3, "0")}`;
}

export function plateNo(n: number) {
  return `Pl. ${ROMAN[n] ?? n}`;
}

export function longDate(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export function shortDate(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function accession(iso: string | null, n: number) {
  const d = iso ? new Date(iso) : new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return `Acc. ${d.getFullYear()}.${p(d.getMonth() + 1)}${p(d.getDate())}.${String(n).padStart(3, "0")}`;
}

export function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
