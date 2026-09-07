export type ConnectorCategory =
  | 'schedule'
  | 'documents'
  | 'erp'
  | 'hr'
  | 'collaboration'
  | 'field'
  | 'pm-suite';

export type ConnectorStatus = 'Healthy' | 'Watch' | 'Offline' | 'Not configured' | 'Syncing';

export type PmConnector = {
  id: string;
  name: string;
  vendor: string;
  category: ConnectorCategory;
  purpose: string;
  mode: string;
  owner: string;
  status: ConnectorStatus;
  lastSync: string | null;
  endpointEnv: string;
  supports: string[];
  notes: string;
};

export const PM_CONNECTORS: PmConnector[] = [
  {
    id: 'primavera-p6',
    name: 'Oracle Primavera P6',
    vendor: 'Oracle',
    category: 'schedule',
    purpose: 'WBS, activities, baselines, critical path and progress import',
    mode: 'Scheduled import / API',
    owner: 'Project Controls',
    status: 'Healthy',
    lastSync: '2026-09-06T22:14:00.000Z',
    endpointEnv: 'DLE_P6_API_URL',
    supports: ['WBS', 'Activities', 'Baselines', 'Resources', 'Progress'],
    notes: 'P6 remains schedule-authoring source where adopted. DLE stores governed copies.',
  },
  {
    id: 'primavera-cloud',
    name: 'Primavera Cloud',
    vendor: 'Oracle',
    category: 'schedule',
    purpose: 'Cloud schedule collaboration and lookahead programmes',
    mode: 'API',
    owner: 'Project Controls',
    status: 'Not configured',
    lastSync: null,
    endpointEnv: 'DLE_P6_CLOUD_API_URL',
    supports: ['Schedules', 'Lookaheads', 'Risk'],
    notes: 'Optional cloud schedule connector for programmes not hosted on-prem P6.',
  },
  {
    id: 'ms-project',
    name: 'Microsoft Project / Project Online',
    vendor: 'Microsoft',
    category: 'schedule',
    purpose: 'Import project plans and task progress from MS Project Online',
    mode: 'Graph / Project Online API',
    owner: 'PMO',
    status: 'Watch',
    lastSync: '2026-09-05T18:40:00.000Z',
    endpointEnv: 'DLE_MSPROJECT_API_URL',
    supports: ['Tasks', 'Resources', 'Baselines'],
    notes: 'Used for smaller programmes and proposal schedules.',
  },
  {
    id: 'edms-cde',
    name: 'EDMS / CDE',
    vendor: 'Document Control',
    category: 'documents',
    purpose: 'Controlled documents, revisions, transmittals and metadata',
    mode: 'API',
    owner: 'Document Control',
    status: 'Healthy',
    lastSync: '2026-09-07T06:48:00.000Z',
    endpointEnv: 'DLE_EDMS_API_URL',
    supports: ['Documents', 'Revisions', 'Transmittals', 'Metadata'],
    notes: 'Binaries remain in CDE. DLE stores immutable references and workflow status.',
  },
  {
    id: 'aconex',
    name: 'Oracle Aconex',
    vendor: 'Oracle',
    category: 'documents',
    purpose: 'Client/contractor correspondence and controlled project mail',
    mode: 'API',
    owner: 'Document Control',
    status: 'Not configured',
    lastSync: null,
    endpointEnv: 'DLE_ACONEX_API_URL',
    supports: ['Mail', 'Documents', 'Workflows'],
    notes: 'Optional CDE connector for client-mandated Aconex programmes.',
  },
  {
    id: 'procore',
    name: 'Procore',
    vendor: 'Procore',
    category: 'field',
    purpose: 'Field progress, punch lists, daily logs and site photos',
    mode: 'API',
    owner: 'Construction',
    status: 'Not configured',
    lastSync: null,
    endpointEnv: 'DLE_PROCORE_API_URL',
    supports: ['Daily logs', 'Punch', 'Photos', 'RFIs'],
    notes: 'Field execution connector for construction-led programmes.',
  },
  {
    id: 'sage-x3',
    name: 'Sage X3',
    vendor: 'Sage',
    category: 'erp',
    purpose: 'Project finance, procurement commitments and supplier actuals',
    mode: 'Bi-directional controlled',
    owner: 'Finance Systems',
    status: 'Healthy',
    lastSync: '2026-09-07T06:30:00.000Z',
    endpointEnv: 'DLE_SAGE_X3_API_URL',
    supports: ['Commitments', 'Actuals', 'Suppliers', 'POs'],
    notes: 'Finance remains system of record. PM displays governed project cost views.',
  },
  {
    id: 'sage-people',
    name: 'Sage 300 People / HRIS',
    vendor: 'Sage',
    category: 'hr',
    purpose: 'Employees, project resources and timesheet capacity',
    mode: 'Scheduled import',
    owner: 'HR / IT',
    status: 'Healthy',
    lastSync: '2026-09-07T05:45:00.000Z',
    endpointEnv: 'DLE_HRIS_SYNC',
    supports: ['Employees', 'Timesheets', 'Org structure'],
    notes: 'Uses existing DLE employee directory synchronisation.',
  },
  {
    id: 'microsoft-365',
    name: 'Microsoft 365',
    vendor: 'Microsoft',
    category: 'collaboration',
    purpose: 'Teams notifications, approvals and report distribution',
    mode: 'Graph API',
    owner: 'IT',
    status: 'Watch',
    lastSync: '2026-09-07T07:02:00.000Z',
    endpointEnv: 'DLE_GRAPH_MAIL',
    supports: ['Notifications', 'Approvals', 'Reports'],
    notes: 'Reuses enterprise Graph mail/notification configuration.',
  },
  {
    id: 'asana',
    name: 'Asana',
    vendor: 'Asana',
    category: 'pm-suite',
    purpose: 'Lightweight action tracking for non-EPC internal initiatives',
    mode: 'API',
    owner: 'PMO',
    status: 'Not configured',
    lastSync: null,
    endpointEnv: 'DLE_ASANA_API_URL',
    supports: ['Tasks', 'Projects', 'Comments'],
    notes: 'Optional collaboration connector; not a substitute for P6 on EPC works.',
  },
  {
    id: 'monday',
    name: 'monday.com',
    vendor: 'monday.com',
    category: 'pm-suite',
    purpose: 'Board-based delivery tracking for commercial/internal projects',
    mode: 'API',
    owner: 'PMO',
    status: 'Not configured',
    lastSync: null,
    endpointEnv: 'DLE_MONDAY_API_URL',
    supports: ['Boards', 'Items', 'Updates'],
    notes: 'Optional PM-suite connector for internal delivery boards.',
  },
  {
    id: 'jira',
    name: 'Jira / Jira Align',
    vendor: 'Atlassian',
    category: 'pm-suite',
    purpose: 'Engineering change and digital delivery work items',
    mode: 'API',
    owner: 'IT / Engineering',
    status: 'Not configured',
    lastSync: null,
    endpointEnv: 'DLE_JIRA_API_URL',
    supports: ['Issues', 'Epics', 'Sprints'],
    notes: 'Useful for digital/engineering work packages linked to project WBS.',
  },
];

export const connectorById = (id: string) => PM_CONNECTORS.find((item) => item.id === id) || null;
