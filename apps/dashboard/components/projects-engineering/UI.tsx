import Link from 'next/link';
import { Icon } from '@/components/projects-engineering/Icon';

export function PageHeading({eyebrow='Projects & Engineering',title,description,actions}:{eyebrow?:string,title:string,description:string,actions?:React.ReactNode}){
 return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div><div className="page-actions">{actions}</div></div>
}
export function Button({
  children,
  variant = 'primary',
  href,
  onClick,
  disabled,
  type = 'button',
  form,
}: {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  form?: string;
}) {
  const c = `btn ${variant}`;
  if (href) return <Link href={href} className={c}>{children}</Link>;
  return (
    <button type={type} className={c} onClick={onClick} disabled={disabled} form={form}>
      {children}
    </button>
  );
}
export function KpiCard({label,value,delta,tone='blue',icon}:{label:string,value:string,delta:string,tone?:string,icon?:string}){return <div className={`kpi-card ${tone}`}><div className="kpi-top"><span>{label}</span><div className="kpi-icon"><Icon name={icon||'progress'}/></div></div><strong>{value}</strong><small>{delta}</small></div>}
export function Card({title,subtitle,action,children,className=''}:{title?:string,subtitle?:string,action?:React.ReactNode,children:React.ReactNode,className?:string}){return <section className={`card ${className}`}>{(title||action)&&<header className="card-head"><div>{title&&<h3>{title}</h3>}{subtitle&&<p>{subtitle}</p>}</div>{action}</header>}<div className="card-body">{children}</div></section>}
export function Status({children}:{children:React.ReactNode}){const t=String(children).toLowerCase();let k='neutral';if(/healthy|approved|complete|closed|active|on track/.test(t))k='success';else if(/watch|due soon|medium|review|open/.test(t))k='warning';else if(/critical|overdue|high|late|blocked/.test(t))k='danger';else if(/draft|planned/.test(t))k='info'; return <span className={`status ${k}`}><i/>{children}</span>}
export function Progress({value}:{value:number}){return <div className="progress-wrap"><div className="progress-track"><span style={{width:`${Math.min(100,Math.max(0,value))}%`}}/></div><b>{value.toFixed(1)}%</b></div>}
export function DataTable({headers,rows}:{headers:string[],rows:(string|number|React.ReactNode)[][]}){return <div className="table-wrap"><table><thead><tr>{headers.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((r,ri)=><tr key={ri}>{r.map((c,ci)=><td key={ci}>{c}</td>)}</tr>)}</tbody></table></div>}
export function Toolbar({placeholder='Search records...'}:{placeholder?:string}){return <div className="toolbar"><div className="search-box"><Icon name="search"/><input placeholder={placeholder}/></div><button className="tool-btn"><Icon name="filter"/>Filters</button><button className="tool-btn"><Icon name="export"/>Export</button><button className="tool-btn square"><Icon name="more"/></button></div>}
export function MiniBar({label,value,max=100}:{label:string,value:number,max?:number}){return <div className="mini-bar"><div><span>{label}</span><b>{value}%</b></div><div className="mini-track"><span style={{width:`${Math.min(100,value/max*100)}%`}}/></div></div>}
export function Sparkline({points}:{points:number[]}){const max=Math.max(...points),min=Math.min(...points),w=180,h=52;const coords=points.map((p,i)=>`${i*(w/(points.length-1))},${h-((p-min)/(max-min||1))*h}`).join(' ');return <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"><polyline fill="none" stroke="currentColor" strokeWidth="3" points={coords}/></svg>}

