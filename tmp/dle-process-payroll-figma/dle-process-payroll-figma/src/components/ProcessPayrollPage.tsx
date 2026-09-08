'use client';
import {useState} from 'react';
import styles from './ProcessPayrollPage.module.css';
import {Search, Bell, Mail, CalendarDays, RefreshCw, FileSpreadsheet, Play, Users, WalletCards, PieChart, TriangleAlert, Check, MoreHorizontal, Filter, Download, ChevronDown} from '@tabler/icons-react';

const employees = [
 ['TEMITOPE ODULATE','P0442','Corporate Office','Permanent','₦6,484,707','₦1,832,600','₦4,652,107','₦6,896,073'],
 ['NKEIRU MGBEOJI','P0364','Legal','Permanent','₦6,185,225','₦1,739,518','₦4,445,707','₦6,577,593'],
 ['ABIODUN MAMORA','P0458','Finance and Account','Permanent','₦6,185,225','₦1,739,518','₦4,445,707','₦6,577,593'],
 ['CHINWE ILOH','P0463','Marketing and Sales','Permanent','₦6,017,481','₦1,458,467','₦4,559,014','₦6,366,186'],
 ['BASSEY CLETUS','L2792','Quality Control','Lumpsum','₦4,157,468','₦857,468','₦3,300,000','₦4,157,468']
];

export default function ProcessPayrollPage(){
 const [schedule,setSchedule]=useState('DLE Salaries');
 const [tab,setTab]=useState('Payroll Register');
 const schedules=[['DLE Salaries','139 Employees','CFO Approved • Active'],['DLPC Salaries','39 Employees','Ready to Process'],['DLE Day-rate','0 Employees','Not Started'],['DLPC Day-rate','0 Employees','Not Started']];
 const nav=['Dashboard','Workflow','Payroll Approval','Process Payroll','Pay Setup','Earnings','Deductions','Statutory','Bank & Finance','Reports'];
 const steps=['Validate','Run Payroll','Submit','HR Approve','Finance Approve','CFO Approve','MD / CEO Approve','Release','Bank Schedule','Payslips','Statutory Reports'];
 return <div className={styles.shell}>
  <aside className={styles.sidebar}>
   <div className={styles.logo}>DL <span style={{fontSize:13,marginLeft:6}}>DORMAN LONG</span><small>ENGINEERING LIMITED</small></div>
   <div className={styles.sectionTitle}>Enterprise Operations</div>
   {['Dashboard','Employees','Organization','Workforce Management','Leave Management'].map(x=><div className={styles.navItem} key={x}>{x}<span className={styles.chev}>⌄</span></div>)}
   <div className={styles.navActive}>▣ Payroll Management <span className={styles.chev}>⌃</span></div>
   <div className={styles.navGroup}>{nav.map(x=><div className={x==='Process Payroll'?styles.navActive:styles.navItem} key={x}>{x}</div>)}</div>
   {['Benefits','Performance Management','Learning & Development','Recruitment','Visitor Management','Administration'].map(x=><div className={styles.navItem} key={x}>{x}<span className={styles.chev}>⌄</span></div>)}
  </aside>
  <main className={styles.main}>
   <header className={styles.topbar}><div style={{fontSize:20}}>☰</div><div className={styles.brandMini}>HRIS</div><div className={styles.search}><Search size={16} className={styles.searchIcon}/><input placeholder="Search employees, payroll, reports..."/></div><div className={styles.topActions}><Bell size={19}/><Mail size={19}/><div className={styles.userBlock}><div className={styles.avatar}/><div className={styles.userText}><b>Chris Ogbaisi</b><span>IT Manager</span></div><ChevronDown size={14}/></div></div></header>
   <div className={styles.content}>
    <div className={styles.crumbs}>HRIS &nbsp;›&nbsp; Payroll Management &nbsp;›&nbsp; <b>Process Payroll</b></div>
    <div className={styles.header}><div className={styles.titleRow}><div className={styles.titleIcon}>⚙</div><div><h1>Process Payroll</h1><div className={styles.subtitle}>Prepare, validate and process payroll. Select a schedule below to view details.</div></div></div><div className={styles.headerActions}><button className={`${styles.btn} ${styles.periodBtn}`}>August 2026 <CalendarDays size={16}/></button><button className={`${styles.btn} ${styles.btnBlue}`}><RefreshCw size={16}/>Refresh</button><button className={`${styles.btn} ${styles.btnGreen}`}><FileSpreadsheet size={16}/>Export CSV</button><button className={`${styles.btn} ${styles.btnDark}`}><Play size={16}/>Process Payroll</button></div></div>

    <div className={styles.scheduleTabs}>{schedules.map(([name,count,status])=><button key={name} onClick={()=>setSchedule(name)} className={`${styles.scheduleCard} ${schedule===name?styles.active:''}`}><div className={styles.schedIcon}><Users size={23}/></div><div className={styles.schedBody}><b>{name}</b><span>{count}</span><span className={styles.schedStatus}>● {status}</span></div></button>)}</div>

    <section className={styles.panel}>
     <div className={styles.panelHead}><div><h2>{schedule} – August 2026 <span className={styles.activeBadge}>● Active</span></h2><p>Run: payroll-2026-08-salaried-DLE &nbsp; | &nbsp; Loaded: 08 Sept 2026, 10:01</p></div><button className={styles.btn}>Schedule Details</button></div>
     <div className={styles.summaryGrid}>
      <div className={styles.metric}><div className={styles.metricIcon}><Users size={20}/></div><div className={styles.metricLabel}>Ready Employees</div><div className={styles.metricValue}>139</div><div className={styles.metricMeta}>100% of total employees</div><div className={styles.metricDelta}>↘ -6 · -4.1% vs July 2026</div></div>
      <div className={`${styles.metric} ${styles.green}`}><div className={styles.metricIcon}><WalletCards size={20}/></div><div className={styles.metricLabel}>Gross Pay</div><div className={styles.metricValue}>₦113,719,411</div><div className={styles.metricMeta}>Net Pay: ₦91,831,140</div><div className={styles.metricDelta}>↘ -₦23,945,992 · -17.4% vs July 2026</div></div>
      <div className={`${styles.metric} ${styles.red}`}><div className={styles.metricIcon}><PieChart size={20}/></div><div className={styles.metricLabel}>Total Deductions</div><div className={styles.metricValue}>₦21,888,271</div><div className={styles.metricMeta}>19.2% of gross pay</div><div className={styles.metricDelta}>↘ -₦3,467,610 · -13.7% vs July 2026</div></div>
      <div className={`${styles.metric} ${styles.purple}`}><div className={styles.metricIcon}><TriangleAlert size={20}/></div><div className={styles.metricLabel}>Issues / Exceptions</div><div className={styles.metricValue}>0</div><div className={styles.metricMeta}>0 blocked · 0 review lines</div><div className={styles.metricDelta}>All checks passed</div></div>
     </div>
     <div className={styles.workflowWrap}><div className={styles.workflowCard}><div className={styles.workflowTitle}>Payroll Processing Workflow</div><div className={styles.workflow}>{steps.map((s,i)=><div key={s} className={`${styles.step} ${i<6?styles.done:''} ${i===6?styles.current:''}`}><div className={styles.circle}>{i<6?<Check size={14}/>:i+1}</div><b>{s}</b><span>{i<6?'Completed':i===6?'Awaiting approval':'Pending'}</span></div>)}</div></div><div className={styles.nextCard}><div className={styles.nextLabel}>Next Step</div><div className={styles.nextValue}>MD / CEO Approve</div><div className={styles.nextMeta}>Final executive sign-off</div></div></div>
    </section>

    <div className={styles.tabs}>{['Payroll Register','Variance','Processing','Outputs','Issues','Audit Trail','Documents'].map(t=><button key={t} onClick={()=>setTab(t)} className={`${styles.tab} ${tab===t?styles.tabActive:''}`}>{t}{t==='Issues'&&<span className={styles.count}>0</span>}</button>)}</div>
    <section className={styles.tablePanel}>
     <div className={styles.toolbar}><input placeholder="Search by name, ID, department..."/><select><option>All Departments</option></select><select><option>All Categories</option></select><select><option>All Statuses</option></select><button className={styles.btn}><Filter size={15}/>More Filters</button><div className={styles.spacer}/><button className={styles.btn}><Download size={15}/>Export Excel</button></div>
     {tab==='Payroll Register'?<><table className={styles.table}><thead><tr><th>#</th><th>Employee</th><th>ID</th><th>Department</th><th>Category</th><th>Gross Pay</th><th>Deductions</th><th>Net Pay</th><th>Employer Cost</th><th>Status</th><th>Actions</th></tr></thead><tbody>{employees.map((e,i)=><tr key={e[1]}><td>{i+1}</td><td><div className={styles.emp}>{e[0]}</div></td><td>{e[1]}</td><td>{e[2]}</td><td>{e[3]}</td><td className={styles.money}>{e[4]}</td><td className={styles.deduct}>{e[5]}</td><td className={styles.net}>{e[6]}</td><td className={styles.employer}>{e[7]}</td><td><span className={styles.ready}>Ready</span></td><td><button className={styles.viewBtn}>View</button> <MoreHorizontal size={15}/></td></tr>)}</tbody></table><div className={styles.pagination}><span>Showing 1 to 5 of 139 employees</span><div className={styles.pages}><button className={styles.pageBtn}>‹</button><button className={`${styles.pageBtn} ${styles.active}`}>1</button><button className={styles.pageBtn}>2</button><button className={styles.pageBtn}>3</button><button className={styles.pageBtn}>4</button><button className={styles.pageBtn}>5</button><button className={styles.pageBtn}>…</button><button className={styles.pageBtn}>28</button><button className={styles.pageBtn}>›</button></div></div></>:<div style={{padding:40,textAlign:'center',color:'#7082a1',fontWeight:700}}>{tab} content area — connect this tab to the corresponding existing payroll module.</div>}
    </section>
   </div>
  </main>
 </div>
}
