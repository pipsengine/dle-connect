import React,{useMemo,useState}from'react';
import{Badge,Button,Field,Tabs}from'../components/UI';
import{employees}from'../data/mock';

const TABS=['Mobilized Crew','New Mobilization','Demobilization','Returning Crew','History','Exceptions'];
const PROJECTS=[
 {code:'DL2601',name:'Offshore Structural Maintenance',client:'Dorman Long Engineering'},
 {code:'DL0042',name:'Calibration & Mechanical Services',client:'Operations'},
 {code:'DL1811',name:'Fabrication & Installation Works',client:'Projects'},
 {code:'DL0062',name:'Miscellaneous Engineering Jobs',client:'Operations'}
];
const SITES=['Offshore Platform A','Offshore Platform B','FPSO Worksite','Bonny Offshore Base','Escravos Offshore Site'];
const SUPERVISORS=['Engr. Okon','Bello Femi','A. Balogun','Mr. Karomwi'];
const seed=employees.slice(0,9).map((e,i)=>({
 id:`MOB-2026-${String(i+1).padStart(3,'0')}`,employee:e,project:PROJECTS[i%PROJECTS.length],site:SITES[i%3],from:`${18+i} Sep 2026`,expected:'04 Oct 2026',actual:i===2?'28 Sep 2026':'—',home:e.supervisor,offshore:SUPERVISORS[i%SUPERVISORS.length],status:i===2?'Returned':i===7?'Ending Soon':'Mobilized'
}));

function SearchSelect({label,value,onChange,options,placeholder='Search and select...'}){
 const[list,setList]=useState(false); const[q,setQ]=useState('');
 const filtered=options.filter(x=>x.toLowerCase().includes(q.toLowerCase()));
 return <Field label={label}><div className="combo"><button type="button" className="comboButton" onClick={()=>setList(!list)}><span className={value?'':'muted'}>{value||placeholder}</span><span>⌄</span></button>{list&&<div className="comboMenu"><input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="Type to search..."/>{filtered.map(x=><button type="button" key={x} onClick={()=>{onChange(x);setList(false);setQ('')}}>{x}</button>)}{!filtered.length&&<div className="comboEmpty">No matching records</div>}</div>}</div></Field>
}

function CrewPicker({selected,setSelected}){
 const[q,setQ]=useState('');
 const pool=employees.filter(e=>`${e.id} ${e.name} ${e.supervisor} ${e.workCentre}`.toLowerCase().includes(q.toLowerCase()));
 const toggle=id=>setSelected(selected.includes(id)?selected.filter(x=>x!==id):[...selected,id]);
 const allVisible=pool.length>0&&pool.every(e=>selected.includes(e.id));
 return <div className="crewPicker">
  <div className="crewPickerHead"><div><b>Select Employees</b><span>Select one or multiple employees for this mobilization</span></div><Badge tone={selected.length?'blue':'slate'}>{selected.length} selected</Badge></div>
  <div className="crewSearch"><span>⌕</span><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search employee code, name, supervisor or work centre..."/><button type="button" onClick={()=>setSelected(allVisible?selected.filter(id=>!pool.some(e=>e.id===id)):[...new Set([...selected,...pool.map(e=>e.id)])])}>{allVisible?'Clear visible':'Select all visible'}</button></div>
  {selected.length>0&&<div className="selectedChips">{selected.map(id=>{const e=employees.find(x=>x.id===id);return <span key={id}><b>{id}</b> {e?.name}<button type="button" onClick={()=>toggle(id)}>×</button></span>})}</div>}
  <div className="crewRows">{pool.map(e=><label key={e.id} className={selected.includes(e.id)?'crewRow chosen':'crewRow'}><input type="checkbox" checked={selected.includes(e.id)} onChange={()=>toggle(e.id)}/><div className="personIcon">{e.name.split(' ').map(x=>x[0]).join('').slice(0,2)}</div><div className="personMain"><b>{e.name}</b><span>{e.id} · {e.workCentre}</span></div><div className="personMeta"><b>{e.supervisor}</b><span>{e.location}</span></div><Badge tone="green">Eligible</Badge></label>)}</div>
 </div>
}

function MobilizationModal({onClose,onSave}){
 const[selected,setSelected]=useState([]); const[project,setProject]=useState(''); const[site,setSite]=useState(''); const[supervisor,setSupervisor]=useState('');
 const[from,setFrom]=useState('2026-09-28'); const[expected,setExpected]=useState('2026-10-12'); const[reference,setReference]=useState(''); const[reason,setReason]=useState(''); const[notes,setNotes]=useState('');
 const valid=selected.length>0&&project&&site&&supervisor&&from&&expected&&expected>=from&&reason.trim();
 const projectOptions=PROJECTS.map(p=>`${p.code} — ${p.name}`);
 return <div className="overlay offshoreOverlay"><div className="modal mobilizationModal">
   <div className="modalHead rich"><div><span className="modalEyebrow">OFFSHORE & MOBILIZATION</span><h3>New Crew Mobilization</h3><p>Mobilize multiple employees to one offshore project and site without changing their home crew assignment.</p></div><button onClick={onClose}>×</button></div>
   <div className="modalBody mobilizationBody">
    <div className="noticeBar"><div className="noticeIcon">i</div><div><b>Mobilization establishes temporary offshore eligibility only.</b><span>It does not create attendance, project hours, overtime or payable days. Actual work remains a Timesheet Entry transaction.</span></div></div>
    <section className="modalSection"><div className="sectionTitle"><b>Mobilization details</b><span>Define the offshore assignment that applies to all selected employees.</span></div>
     <div className="formGrid threeCols">
      <SearchSelect label="Timesheet Period" value="October 2026 Period" onChange={()=>{}} options={['October 2026 Period','September 2026 Period']} />
      <SearchSelect label="Offshore Project *" value={project} onChange={setProject} options={projectOptions} placeholder="Search project code or name..."/>
      <SearchSelect label="Offshore Location / Site *" value={site} onChange={setSite} options={SITES} placeholder="Search offshore site..."/>
      <Field label="Mobilization From *"><input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></Field>
      <Field label="Expected Return *"><input type="date" value={expected} min={from} onChange={e=>setExpected(e.target.value)}/></Field>
      <SearchSelect label="Offshore Supervisor *" value={supervisor} onChange={setSupervisor} options={SUPERVISORS} placeholder="Search supervisor..."/>
      <Field label="Authorization / Reference"><input value={reference} onChange={e=>setReference(e.target.value)} placeholder="e.g. MOB/OPS/2026/091"/></Field>
      <Field label="Mobilization Reason *"><select value={reason} onChange={e=>setReason(e.target.value)}><option value="">Select reason...</option><option>Project requirement</option><option>Offshore campaign</option><option>Maintenance shutdown</option><option>Client request</option><option>Emergency deployment</option></select></Field>
      <Field label="Transport / Movement"><select><option>Company arranged</option><option>Client arranged</option><option>Marine transfer</option><option>Helicopter transfer</option><option>Other</option></select></Field>
     </div>
    </section>
    <section className="modalSection"><CrewPicker selected={selected} setSelected={setSelected}/></section>
    <section className="modalSection"><div className="sectionTitle"><b>Operational notes</b><span>Optional supporting information for the mobilization record and audit trail.</span></div><Field label="Notes"><textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Enter operational instructions, client requirements, logistics or other comments..."/></Field></section>
    {expected<from&&<div className="validationError">Expected return cannot be earlier than the mobilization date.</div>}
   </div>
   <div className="modalFoot mobilizationFoot"><div className="footSummary"><b>{selected.length}</b><span>employee{selected.length===1?'':'s'} selected</span>{project&&<><i>•</i><span>{project.split(' — ')[0]}</span></>}{site&&<><i>•</i><span>{site}</span></>}</div><Button kind="secondary" onClick={onClose}>Cancel</Button><Button disabled={!valid} onClick={()=>onSave({selected,project,site,supervisor,from,expected,reference,reason,notes})}>Mobilize {selected.length||''} Employee{selected.length===1?'':'s'}</Button></div>
  </div></div>
}

export default function OffshoreMobilization(){
 const[activeTab,setActiveTab]=useState(TABS[0]); const[modal,setModal]=useState(false); const[query,setQuery]=useState(''); const[records,setRecords]=useState(seed); const[toast,setToast]=useState('');
 const filtered=useMemo(()=>records.filter(r=>`${r.employee.id} ${r.employee.name} ${r.project.code} ${r.project.name} ${r.site} ${r.status}`.toLowerCase().includes(query.toLowerCase())),[records,query]);
 const save=m=>{const p=PROJECTS.find(x=>`${x.code} — ${x.name}`===m.project); const additions=m.selected.map((id,i)=>{const e=employees.find(x=>x.id===id);return{id:`MOB-2026-${String(records.length+i+1).padStart(3,'0')}`,employee:e,project:p,site:m.site,from:new Date(m.from+'T00:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}),expected:new Date(m.expected+'T00:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}),actual:'—',home:e.supervisor,offshore:m.supervisor,status:'Mobilized'}});setRecords([...additions,...records]);setModal(false);setToast(`${additions.length} employee${additions.length===1?'':'s'} mobilized successfully.`);setTimeout(()=>setToast(''),3500)};
 return <>
  {toast&&<div className="toast">✓ {toast}</div>}
  <div className="pageTitle"><div><span className="eyebrow">TIMESHEET MANAGEMENT</span><h1>Offshore & Mobilization</h1><p>Plan, control and track project-linked offshore crew movements. Mobilization never creates attendance or worked hours.</p></div><div className="actions"><Button kind="secondary">Export</Button><Button onClick={()=>setModal(true)}>+ New Mobilization</Button></div></div>
  <Tabs items={TABS} active={activeTab} setActive={setActiveTab}/>
  <section className="metricGrid offshoreMetrics"><div className="metric"><span>Mobilized Crew</span><b>{records.filter(x=>x.status==='Mobilized').length}</b><small>Currently offshore</small></div><div className="metric"><span>Projects</span><b>{new Set(records.map(x=>x.project.code)).size}</b><small>Active offshore projects</small></div><div className="metric"><span>Returning Soon</span><b>{records.filter(x=>x.status==='Ending Soon').length}</b><small>Expected within 7 days</small></div><div className="metric"><span>Returned</span><b>{records.filter(x=>x.status==='Returned').length}</b><small>Demobilized to home crew</small></div><div className="metric"><span>Exceptions</span><b>0</b><small>No blocking conflicts</small></div></section>
  <section className="panel offshorePanel"><div className="panelHead"><div><h3>{activeTab}</h3><p>Effective-dated offshore records · employee home assignments remain preserved</p></div><div className="tableSearch"><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search employee, project, site..."/></div></div>
   <div className="filterRow offshoreFilters"><Field label="Timesheet Period"><select><option>October 2026 Period</option><option>September 2026 Period</option><option>All Periods</option></select></Field><Field label="Project"><select><option>All Projects</option>{PROJECTS.map(p=><option key={p.code}>{p.code} — {p.name}</option>)}</select></Field><Field label="Offshore Site"><select><option>All Offshore Sites</option>{SITES.map(s=><option key={s}>{s}</option>)}</select></Field><Field label="Status"><select><option>All Statuses</option><option>Mobilized</option><option>Ending Soon</option><option>Returned</option></select></Field></div>
   <div className="tableWrap"><table><thead><tr><th>Employee</th><th>Project</th><th>Offshore Site</th><th>Mobilized From</th><th>Expected Return</th><th>Actual Return</th><th>Home Supervisor</th><th>Offshore Supervisor</th><th>Status</th><th></th></tr></thead><tbody>{filtered.map(r=><tr key={r.id}><td><div className="employeeCell"><div className="personIcon smallicon">{r.employee.name.split(' ').map(x=>x[0]).join('').slice(0,2)}</div><div><b>{r.employee.name}</b><span>{r.employee.id}</span></div></div></td><td><b>{r.project.code}</b><span className="block">{r.project.name}</span></td><td>{r.site}</td><td>{r.from}</td><td>{r.expected}</td><td>{r.actual}</td><td>{r.home}</td><td>{r.offshore}</td><td><Badge tone={r.status==='Returned'?'green':r.status==='Ending Soon'?'amber':'blue'}>{r.status}</Badge></td><td><button className="kebab">•••</button></td></tr>)}{!filtered.length&&<tr><td colSpan="10"><div className="emptyState"><b>No mobilization records found</b><span>Adjust your filters or create a new crew mobilization.</span></div></td></tr>}</tbody></table></div>
  </section>
  {modal&&<MobilizationModal onClose={()=>setModal(false)} onSave={save}/>} 
 </>
}
