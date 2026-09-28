import React from'react';
export const Badge=({children,tone='blue'})=><span className={'badge '+tone}>{children}</span>;
export const Button=({children,kind='primary',onClick,disabled})=><button disabled={disabled} onClick={onClick} className={'btn '+kind}>{children}</button>;
export const Card=({label,value,sub,tone=''})=><div className={'kpi '+tone}><span>{label}</span><strong>{value}</strong><small>{sub}</small></div>;
export const Tabs=({items,active,setActive})=><div className="tabs">{items.map(x=><button key={x} onClick={()=>setActive(x)} className={active===x?'active':''}>{x}</button>)}</div>;
export const Modal=({title,children,onClose,footer,wide=false})=><div className="overlay"><div className={wide?'modal wide':'modal'}><div className="modalHead"><h3>{title}</h3><button onClick={onClose}>×</button></div><div className="modalBody">{children}</div><div className="modalFoot">{footer}</div></div></div>;
export const Field=({label,children})=><label className="field"><span>{label}</span>{children}</label>;
export const Table=({headers,rows,empty='No records yet.'})=><div className="tableWrap"><table><thead><tr>{headers.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.length?rows.map((r,i)=><tr key={i}>{r.map((v,j)=><td key={j}>{v}</td>)}</tr>):<tr><td colSpan={headers.length} style={{padding:'28px 16px',color:'#64748b'}}>{empty}</td></tr>}</tbody></table></div>;
export const Empty=({text})=><div className="empty">{text}</div>;
