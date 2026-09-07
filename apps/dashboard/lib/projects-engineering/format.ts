export const naira = (n:number) => new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',maximumFractionDigits:0}).format(n);
export const money = (n:number,c='NGN') => new Intl.NumberFormat('en-NG',{style:'currency',currency:c,maximumFractionDigits:0}).format(n);
export const pct = (n:number) => `${Number.isFinite(n) ? n.toFixed(1) : '0.0'}%`;
export const hours = (n:number) => `${new Intl.NumberFormat('en-NG',{maximumFractionDigits:1,minimumFractionDigits:0}).format(Number.isFinite(n) ? n : 0)} hrs`;
export const dmy = (d:string) => new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(d));
