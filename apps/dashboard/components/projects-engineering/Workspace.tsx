import Link from 'next/link';
import { projects, workspaceTabs } from '@/lib/projects-engineering/data';
import { Status, Progress } from '@/components/projects-engineering/UI';
import { money, dmy } from '@/lib/projects-engineering/format';

export function ProjectHeader({id,active}:{id:string,active:string}){const p=projects.find(x=>x.id===id)||projects[0];return <>
 <div className="project-hero">
  <div className="project-identity"><div className="project-code">{p.code}</div><div><h1>{p.name}</h1><p>{p.client} Â· {p.location}</p></div></div>
  <div className="project-hero-grid"><div><small>Project Manager</small><strong>{p.manager}</strong></div><div><small>Contract Value</small><strong>{money(p.contractValue,p.currency)}</strong></div><div><small>Project Dates</small><strong>{dmy(p.start)} â€“ {dmy(p.finish)}</strong></div><div><small>Progress</small><Progress value={p.actual}/></div><div><small>Health</small><Status>{p.health}</Status></div></div>
 </div>
 <nav className="workspace-tabs">{workspaceTabs.map(t=><Link key={t.key} href={`/projects-engineering/projects/${id}/${t.key}`} className={active===t.key?'active':''}>{t.label}</Link>)}</nav>
 </>}

