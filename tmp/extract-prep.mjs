import { readFileSync } from 'node:fs';

const file = 'deployment/iis/site/apps/dashboard/.next/static/chunks/app/(commercial)/commercial/tenders/page-68e6090f1035d142.js';
const text = readFileSync(file, 'utf8');
const marker = 'let a=["Not Started","In Progress","Submitted"]';
const at = text.indexOf(marker);
console.log('marker', at);
console.log(text.slice(at, at + 4500));
