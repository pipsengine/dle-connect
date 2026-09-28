export const STAGES=['Supervisor','Cost Control','Project Manager','Consolidation','HR','Payroll Ready'];
export function splitForProjectManagers(lines,projects){return lines.reduce((a,l)=>{const p=projects.find(x=>x.code===l.project);const owner=p?.manager||'Unassigned';(a[owner]??=[]).push(l);return a;},{});}
export function consolidationStatus(projectApprovals){const total=projectApprovals.length,approved=projectApprovals.filter(x=>x.status==='Approved').length;return{approved,total,label:`${approved}/${total} Projects Approved`,ready:total>0&&approved===total};}
