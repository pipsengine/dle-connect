export const naira = (n:number) => new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',maximumFractionDigits:0}).format(n);
export const money = (n:number,c='NGN') => new Intl.NumberFormat('en-NG',{style:'currency',currency:c,maximumFractionDigits:0}).format(n);
export const pct = (n:number) => `${Number.isFinite(n) ? n.toFixed(1) : '0.0'}%`;
export const hours = (n:number) => `${new Intl.NumberFormat('en-NG',{maximumFractionDigits:1,minimumFractionDigits:0}).format(Number.isFinite(n) ? n : 0)} hrs`;
export const dmy = (d:string) => new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(d));

/** Compact NGN for executive KPIs: ₦245.6bn / ₦12.4m / ₦850k */
export const compactNaira = (value: number) => {
  const n = Number.isFinite(value) ? value : 0;
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000_000) return `${sign}₦${(abs / 1_000_000_000).toFixed(1)}bn`;
  if (abs >= 1_000_000) return `${sign}₦${(abs / 1_000_000).toFixed(1)}m`;
  if (abs >= 1_000) return `${sign}₦${(abs / 1_000).toFixed(1)}k`;
  return `${sign}₦${abs.toFixed(0)}`;
};
