import type { Project, SectionKey } from '@/lib/projects-engineering/types';

export const projects:Project[] = [
 {id:'hdjk',code:'HDJK-001',name:'HD/JK Integrated EPC Development',client:'Major Energy Client',manager:'Engr. A. Adeyemi',contractValue:18600000000,currency:'NGN',start:'2026-02-03',finish:'2027-06-30',planned:42.8,actual:39.6,costPerformance:0.97,schedulePerformance:0.93,phase:'Engineering / Procurement',status:'Active',health:'Watch',location:'Lagos / Project Sites',businessUnit:'Projects & Engineering',description:'Integrated engineering, procurement, fabrication, construction support and information handover programme.'},
 {id:'delta',code:'DLE-ENG-026',name:'Delta Fabrication Upgrade',client:'Industrial Client',manager:'Engr. M. Okafor',contractValue:4250000000,currency:'NGN',start:'2026-01-12',finish:'2026-12-18',planned:61.4,actual:63.2,costPerformance:1.02,schedulePerformance:1.03,phase:'Fabrication',status:'Active',health:'Healthy',location:'Lagos Fabrication Yard',businessUnit:'Operations',description:'Brownfield engineering and fabrication upgrade programme.'},
 {id:'pipeline',code:'PIPE-014',name:'Pipeline Integrity Rehabilitation',client:'Energy Infrastructure Client',manager:'Engr. T. Eze',contractValue:7900000000,currency:'NGN',start:'2026-03-08',finish:'2027-02-15',planned:31.5,actual:25.1,costPerformance:0.91,schedulePerformance:0.80,phase:'Detailed Engineering',status:'Active',health:'Critical',location:'Niger Delta',businessUnit:'Projects & Engineering',description:'Integrity engineering, procurement and rehabilitation works.'},
 {id:'terminal',code:'TERM-011',name:'Terminal Electrical Reliability Works',client:'Marine Terminal Client',manager:'Engr. I. Bello',contractValue:3100000000,currency:'NGN',start:'2025-11-02',finish:'2026-10-30',planned:82.0,actual:80.7,costPerformance:1.00,schedulePerformance:0.98,phase:'Construction',status:'Active',health:'Healthy',location:'Lagos',businessUnit:'Projects & Engineering',description:'Electrical and instrumentation reliability enhancement works.'}
];

export const portfolioKpis = [
 {label:'Active Projects',value:'12',delta:'+2 this quarter',tone:'blue'},
 {label:'Portfolio Value',value:'â‚¦48.7bn',delta:'â‚¦31.8bn committed',tone:'indigo'},
 {label:'Overall Progress',value:'46.8%',delta:'49.2% planned',tone:'cyan'},
 {label:'Projects At Risk',value:'3',delta:'1 critical Â· 2 watch',tone:'amber'},
 {label:'Deliverables Due',value:'47',delta:'11 overdue',tone:'purple'},
 {label:'Open NCRs',value:'16',delta:'5 > 14 days',tone:'rose'}
];

export const milestones = [
 ['M-041','IFC Piping Isometrics Complete','Engineering','15 Sep 2026','78%','Watch'],
 ['M-042','Structural Steel Available for Fabrication','Procurement','23 Sep 2026','64%','Critical'],
 ['M-045','Vendor Data Book Cycle 2','Document Control','30 Sep 2026','51%','Healthy'],
 ['M-047','Mechanical Completion Area A','Construction','14 Oct 2026','33%','Healthy'],
 ['M-051','Client Progress Review','Management','28 Sep 2026','â€”','Healthy']
];

export const engineeringDeliverables = [
 ['ENG-PIP-0112','Piping General Arrangement â€“ Unit 300','Piping','Rev C','IFC','12 Sep 2026','Engr. O. James','Watch'],
 ['ENG-STR-0087','Pipe Rack Structural Details','Civil/Structural','Rev B','Client Review','09 Sep 2026','Engr. F. Musa','Critical'],
 ['ENG-ELE-0051','Single Line Diagram â€“ MCC-04','Electrical','Rev A','Approved','04 Sep 2026','Engr. K. Udo','Healthy'],
 ['ENG-INS-0072','Instrument Index','Instrumentation','Rev D','Checker Review','13 Sep 2026','Engr. S. Obi','Watch'],
 ['ENG-PRO-0035','Process Datasheet â€“ Separator V-204','Process','Rev B','Approved','02 Sep 2026','Engr. N. Cole','Healthy']
];

export const procurement = [
 ['PR-026-104','Structural Steel Package','Approved PO','Vendor A','â‚¦1.28bn','23 Sep 2026','68%','Critical'],
 ['PR-026-119','Control Valves','Technical Evaluation','Vendor TBD','â‚¦420m','08 Oct 2026','41%','Watch'],
 ['PR-026-097','Electrical Cables','Manufacturing','Vendor B','â‚¦615m','26 Sep 2026','76%','Healthy'],
 ['PR-026-128','Pipe Fittings','RFQ','Bid Stage','â‚¦198m','17 Oct 2026','22%','Watch']
];

export const risks = [
 ['R-026-018','Late structural steel delivery','Schedule','High','Likely','Critical','Procurement Lead','Mitigation in progress'],
 ['R-026-021','IFC drawing backlog','Engineering','Medium','Likely','High','Engineering Manager','Recovery plan active'],
 ['R-026-023','FX movement on imported valves','Commercial','High','Possible','High','Commercial Manager','Hedging review'],
 ['R-026-028','Restricted work-front access','Construction','Medium','Possible','Medium','Construction Manager','Client interface open']
];

export const actions = [
 ['ACT-119','Close comments on structural calculation package','Engineering','Engr. F. Musa','09 Sep 2026','Overdue'],
 ['ACT-121','Issue revised steel expediting recovery plan','Procurement','Procurement Lead','08 Sep 2026','Due Soon'],
 ['ACT-124','Confirm Area A access date','Client Interface','Project Manager','11 Sep 2026','Open'],
 ['ACT-128','Prepare September cost forecast','Cost Control','Cost Controller','15 Sep 2026','Open']
];

export const workspaceTabs:{key:SectionKey;label:string}[] = [
 {key:'overview',label:'Overview'},{key:'planning',label:'Planning'},{key:'engineering',label:'Engineering'},
 {key:'deliverables',label:'Deliverables'},{key:'documents',label:'Documents'},{key:'procurement',label:'Procurement'},
 {key:'cost',label:'Cost & Budget'},{key:'resources',label:'Resources'},{key:'construction',label:'Construction'},
 {key:'quality',label:'Quality'},{key:'hse',label:'HSE'},{key:'risks',label:'Risks & Issues'},
 {key:'changes',label:'Changes'},{key:'actions',label:'Actions'},{key:'interface',label:'Client Interface'},
 {key:'progress',label:'Progress'},{key:'reports',label:'Reports'},{key:'ai',label:'AI Intelligence'},{key:'closeout',label:'Closeout'}
];

