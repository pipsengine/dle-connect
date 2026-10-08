import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
export const Badge=({children,tone='blue'})=><span className={'badge '+tone}>{children}</span>;
export const Button=({children,kind='primary',onClick,disabled})=><button type="button" disabled={disabled} onClick={onClick} className={'btn '+kind}>{children}</button>;
export const Card=({label,value,sub,tone='',onClick})=>onClick
  ? <button type="button" className={`kpi ${tone}`.trim()} onClick={onClick}><span>{label}</span><strong>{value}</strong><small>{sub}</small></button>
  : <div className={`kpi ${tone}`.trim()}><span>{label}</span><strong>{value}</strong><small>{sub}</small></div>;
export function DetailModal({ title, note, headers, rows, onClose }) {
  const count = Array.isArray(rows) ? rows.length : 0;
  return <Modal wide title={title} onClose={onClose} footer={<Button kind="secondary" onClick={onClose}>Close</Button>}>
    <p className="detailNote">{note || `${count} record${count === 1 ? '' : 's'}`}</p>
    <Table headers={headers} rows={rows} empty="Nothing is included in this total." />
  </Modal>;
}
export const Tabs=({items,active,setActive})=><div className="tabs">{items.map(x=><button type="button" key={x} onClick={()=>setActive(x)} className={active===x?'active':''}>{x}</button>)}</div>;
export const Modal=({title,children,onClose,footer,wide=false})=><div className="overlay"><div className={wide?'modal wide':'modal'}><div className="modalHead"><h3>{title}</h3><button type="button" onClick={onClose}>×</button></div><div className="modalBody">{children}</div><div className="modalFoot">{footer}</div></div></div>;
export const Field=({label,required=false,children})=><label className="field"><span>{label}{required ? ' *' : ''}</span>{children}</label>;
const tableCell = (value) => {
  if (value == null || value === false) return '';
  if (typeof value === 'string' || typeof value === 'number') return value;
  if (React.isValidElement(value)) return value;
  return '';
};
export const Table=({headers,rows,empty='No records yet.'})=><div className="tableWrap"><table><thead><tr>{(headers || []).map((h,i)=><th key={i}>{tableCell(h)}</th>)}</tr></thead><tbody>{Array.isArray(rows) && rows.length?rows.map((r,i)=><tr key={i}>{(Array.isArray(r) ? r : []).map((v,j)=><td key={j}>{tableCell(v)}</td>)}</tr>):<tr><td colSpan={(headers || []).length || 1} style={{padding:'28px 16px',color:'#64748b'}}>{empty}</td></tr>}</tbody></table></div>;
export const Empty=({text})=><div className="empty">{text}</div>;

const placeMenu = (node) => {
  const rect = node.getBoundingClientRect();
  const width = Math.min(460, Math.max(rect.width, 280));
  const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - width - 8));
  const spaceBelow = window.innerHeight - rect.bottom - 8;
  const spaceAbove = rect.top - 8;
  const openUp = spaceBelow < 180 && spaceAbove > spaceBelow;
  const maxHeight = Math.max(140, Math.min(320, openUp ? spaceAbove : spaceBelow));
  return {
    position: 'fixed',
    left,
    width,
    maxHeight,
    top: openUp ? Math.max(8, rect.top - maxHeight - 4) : rect.bottom + 4,
    zIndex: 4000,
  };
};

export function AnchoredMenu({ open, anchorRef, children }) {
  const [style, setStyle] = useState(null);
  useEffect(() => {
    if (!open) return undefined;
    const place = () => {
      if (anchorRef.current) setStyle(placeMenu(anchorRef.current));
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, anchorRef]);
  if (!open || !style || typeof document === 'undefined') return null;
  return createPortal(<div className="comboMenu tsMenu" style={style}>{children}</div>, document.body);
}

export function SearchCombo({ label, required = false, placeholder, value, onSelect, search, labelOf, detailOf, clearable = false, variant = 'field' }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [pending, setPending] = useState(false);
  const anchorRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const handle = setTimeout(() => {
      setPending(true);
      Promise.resolve(search(query)).then((rows) => setItems(Array.isArray(rows) ? rows : [])).catch(() => setItems([])).finally(() => setPending(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [query, open]);
  const control = <div className={open ? 'combo open' : 'combo'} ref={anchorRef}>
    <input value={open ? query : (value || '')} placeholder={placeholder} onFocus={() => { setOpen(true); setQuery(''); }} onBlur={() => setTimeout(() => setOpen(false), 180)} onChange={(event) => setQuery(event.target.value)} />
    {clearable && value && !open && <button type="button" className="link" onMouseDown={(event) => event.preventDefault()} onClick={() => onSelect(null)}>Clear</button>}
    <AnchoredMenu open={open} anchorRef={anchorRef}>
      {pending && <span>Searching…</span>}
      {!pending && !items.length && <span>No matches</span>}
      {items.map((item) => {
        const text = labelOf(item);
        const detail = detailOf ? detailOf(item) : '';
        return <button type="button" key={`${item.code || ''}|${item.name || text}`} onMouseDown={(event) => event.preventDefault()} onClick={() => { onSelect(item); setOpen(false); }}><b>{text}</b>{detail ? <small>{detail}</small> : null}</button>;
      })}
    </AnchoredMenu>
  </div>;
  if (variant === 'crew') return <div className="crewFilter"><label>{label} {required && <b>*</b>}</label>{control}</div>;
  return <Field label={label} required={required}>{control}</Field>;
}

export function OptionCombo({ label, value, options, onChange, variant = 'crew' }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const anchorRef = useRef(null);
  const items = (options || []).filter((name) => !query || String(name).toLowerCase().includes(query.toLowerCase()));
  const control = <div className={open ? 'combo open' : 'combo'} ref={anchorRef}>
    <input value={open ? query : (value || '')} placeholder={value || 'Select'} onFocus={() => { setOpen(true); setQuery(''); }} onBlur={() => setTimeout(() => setOpen(false), 180)} onChange={(event) => setQuery(event.target.value)} />
    <AnchoredMenu open={open} anchorRef={anchorRef}>
      {items.map((name) => <button type="button" key={name} onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(name); setOpen(false); }}><b>{name}</b></button>)}
      {!items.length && <span>No matches</span>}
    </AnchoredMenu>
  </div>;
  if (variant === 'field') return <Field label={label}>{control}</Field>;
  return <div className="crewFilter"><label>{label}</label>{control}</div>;
}

export const personLabel = (item) => item?.code ? `${item.code} — ${item.name}` : (item?.name || '');
export const personDetail = (item) => [item?.title, item?.department].filter(Boolean).join(' · ');
