export type NodeKind = 'Company' | 'Division' | 'Business Unit' | 'Department' | 'Team';
export type HealthStatus = 'Healthy' | 'Needs Attention' | 'Critical';

export type OrgNode = {
  id: string;
  parentId: string | null;
  name: string;
  code: string;
  kind: NodeKind;
  leader: string;
  location: string;
  headcount: number;
  openRoles: number;
  budgetUsd: number;
  payrollUsd: number;
  spanOfControl: number;
  successionCoveragePct: number;
  attritionRiskPct: number;
  healthStatus: HealthStatus;
  costCenter: string;
  description: string;
};

export type EnhancedOrgNode = OrgNode & {
  childCount: number;
  descendantCount: number;
};

export type StructureInsight = {
  id: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  recommendation: string;
};

export type DepartmentRecord = EnhancedOrgNode & {
  parentName: string | null;
  parentKind: NodeKind | null;
  parentChain: string[];
  teamCount: number;
  teamHeadcount: number;
  teams: Array<{
    id: string;
    name: string;
    leader: string;
    headcount: number;
    openRoles: number;
    healthStatus: HealthStatus;
  }>;
};

export type UnitSectionRecord = EnhancedOrgNode & {
  recordType: 'Unit' | 'Section';
  parentName: string | null;
  parentKind: NodeKind | null;
  parentChain: string[];
  relatedDepartmentCount: number;
  relatedTeamCount: number;
  relatedHeadcount: number;
  relatedItems: Array<{
    id: string;
    name: string;
    kind: NodeKind;
    leader: string;
    headcount: number;
    openRoles: number;
    healthStatus: HealthStatus;
  }>;
};

export type LocationSiteRecord = {
  id: string;
  name: string;
  recordType: 'Location' | 'Site';
  parentName: string | null;
  parentChain: string[];
  region: string;
  country: string;
  siteCategory: 'State' | 'Head Office' | 'Operational Hub' | 'Yard' | 'Field Site';
  leader: string;
  location: string;
  headcount: number;
  openRoles: number;
  budgetUsd: number;
  payrollUsd: number;
  spanOfControl: number;
  successionCoveragePct: number;
  attritionRiskPct: number;
  healthStatus: HealthStatus;
  costCenter: string;
  description: string;
  nodeCount: number;
  divisionCount: number;
  businessUnitCount: number;
  departmentCount: number;
  teamCount: number;
  relatedItems: Array<{
    id: string;
    name: string;
    kind: NodeKind | 'Site';
    leader: string;
    headcount: number;
    openRoles: number;
    healthStatus: HealthStatus;
  }>;
};

export type JobGradeRecord = {
  id: string;
  code: string;
  name: string;
  family: 'Executive' | 'Management' | 'Professional' | 'Technical' | 'Operations Support';
  level: 'Strategic' | 'Senior' | 'Mid' | 'Entry';
  minSalaryUsd: number;
  midpointSalaryUsd: number;
  maxSalaryUsd: number;
  employeeCount: number;
  openPositions: number;
  successionCoveragePct: number;
  attritionRiskPct: number;
  internalMobilityPct: number;
  averageTenureYears: number;
  femaleRepresentationPct: number;
  healthStatus: HealthStatus;
  benchmarkPosition: string;
  nextGradeCode: string | null;
  keyRoles: string[];
  gradeMix: Array<{
    unit: string;
    headcount: number;
  }>;
  description: string;
};

export type JobTitleRecord = {
  id: string;
  code: string;
  title: string;
  family: JobGradeRecord['family'];
  level: JobGradeRecord['level'];
  gradeCode: string;
  gradeName: string;
  reportingLevel: 'Enterprise' | 'Division' | 'Department' | 'Team';
  benchmarkSalaryUsd: number;
  employeeCount: number;
  openPositions: number;
  departmentCount: number;
  locationCount: number;
  successionCoveragePct: number;
  attritionRiskPct: number;
  internalMobilityPct: number;
  healthStatus: HealthStatus;
  standardizationStatus: 'Standard' | 'Variant' | 'Needs Review';
  benchmarkPosition: string;
  jobPurpose: string;
  commonLocations: string[];
  departments: string[];
  keyResponsibilities: string[];
};

export type ReportingHierarchyRecord = {
  id: string;
  employeeId: string;
  employeeName: string;
  jobTitle: string;
  department: string;
  businessUnit: string;
  location: string;
  layer: 'Executive' | 'Division' | 'Department' | 'Team';
  managerId: string | null;
  managerName: string | null;
  managerTitle: string | null;
  directReports: number;
  indirectReports: number;
  totalReports: number;
  spanOfControl: number;
  successionCoveragePct: number;
  attritionRiskPct: number;
  openCriticalRoles: number;
  approvalCoveragePct: number;
  healthStatus: HealthStatus;
  actingCoverage: 'Covered' | 'At Risk' | 'Unassigned';
  escalationPath: string[];
  primaryTeams: string[];
  responsibilityScope: string;
};

export type PositionRecord = {
  id: string;
  code: string;
  title: string;
  department: string;
  businessUnit: string;
  location: string;
  gradeCode: string;
  family: JobGradeRecord['family'];
  level: JobGradeRecord['level'];
  reportingTo: string;
  positionType: 'Permanent' | 'Contract' | 'Project' | 'Temporary';
  positionStatus: 'Filled' | 'Vacant' | 'Frozen' | 'Under Review';
  incumbentName: string | null;
  incumbentEmployeeId: string | null;
  benchmarkSalaryUsd: number;
  fte: number;
  criticality: 'Critical' | 'Core' | 'Support';
  successionCoveragePct: number;
  attritionRiskPct: number;
  approvalCoveragePct: number;
  healthStatus: HealthStatus;
  replacementPriority: 'Immediate' | 'Planned' | 'Monitor';
  standardPosition: boolean;
  openDays: number;
  jobTitleCode: string;
  responsibilityScope: string;
  requiredCapabilities: string[];
};

export type OrganogramNodeRecord = EnhancedOrgNode & {
  depth: number;
  parentName: string | null;
  parentKind: NodeKind | null;
  parentChain: string[];
  branchHeadcount: number;
  branchOpenRoles: number;
  branchCriticalUnits: number;
  branchAttentionUnits: number;
  directChildNames: string[];
  leaderTitle: string;
  managerialScope: 'Enterprise' | 'Strategic' | 'Operational' | 'Delivery';
};

export const organizationNodes: OrgNode[] = [
  {
    id: 'org-root',
    parentId: null,
    name: 'Dorman Long Engineering',
    code: 'DLE-HQ',
    kind: 'Company',
    leader: 'Group Managing Director',
    location: 'Lagos HQ',
    headcount: 1268,
    openRoles: 34,
    budgetUsd: 98000000,
    payrollUsd: 28400000,
    spanOfControl: 8,
    successionCoveragePct: 82,
    attritionRiskPct: 7,
    healthStatus: 'Healthy',
    costCenter: 'CORP-001',
    description: 'Enterprise parent structure covering operations, projects, and shared services.',
  },
  {
    id: 'div-ops',
    parentId: 'org-root',
    name: 'Operations Division',
    code: 'OPS',
    kind: 'Division',
    leader: 'Executive Director, Operations',
    location: 'Port Harcourt',
    headcount: 462,
    openRoles: 12,
    budgetUsd: 36000000,
    payrollUsd: 11100000,
    spanOfControl: 6,
    successionCoveragePct: 79,
    attritionRiskPct: 9,
    healthStatus: 'Healthy',
    costCenter: 'OPS-100',
    description: 'Operational delivery structure across fabrication, field execution, and maintenance.',
  },
  {
    id: 'div-projects',
    parentId: 'org-root',
    name: 'Projects Division',
    code: 'PRJ',
    kind: 'Division',
    leader: 'Executive Director, Projects',
    location: 'Lagos HQ',
    headcount: 351,
    openRoles: 15,
    budgetUsd: 28400000,
    payrollUsd: 8600000,
    spanOfControl: 7,
    successionCoveragePct: 74,
    attritionRiskPct: 11,
    healthStatus: 'Needs Attention',
    costCenter: 'PRJ-200',
    description: 'Project execution governance for engineering, controls, planning, and site delivery.',
  },
  {
    id: 'div-corp',
    parentId: 'org-root',
    name: 'Corporate Services',
    code: 'CSV',
    kind: 'Division',
    leader: 'Executive Director, Corporate Services',
    location: 'Lagos HQ',
    headcount: 214,
    openRoles: 7,
    budgetUsd: 14100000,
    payrollUsd: 4700000,
    spanOfControl: 5,
    successionCoveragePct: 86,
    attritionRiskPct: 6,
    healthStatus: 'Healthy',
    costCenter: 'CSV-300',
    description: 'Shared services structure covering HR, finance, procurement, legal, and IT.',
  },
  {
    id: 'bu-fabrication',
    parentId: 'div-ops',
    name: 'Fabrication & Yards',
    code: 'OPS-FAB',
    kind: 'Business Unit',
    leader: 'GM, Fabrication',
    location: 'Warri Yard',
    headcount: 178,
    openRoles: 4,
    budgetUsd: 11200000,
    payrollUsd: 3900000,
    spanOfControl: 7,
    successionCoveragePct: 77,
    attritionRiskPct: 8,
    healthStatus: 'Healthy',
    costCenter: 'OPS-110',
    description: 'Fabrication, yard operations, welding, fitting, and structural delivery.',
  },
  {
    id: 'bu-field',
    parentId: 'div-ops',
    name: 'Field Execution',
    code: 'OPS-FLD',
    kind: 'Business Unit',
    leader: 'GM, Field Execution',
    location: 'Bonny Island',
    headcount: 196,
    openRoles: 6,
    budgetUsd: 14900000,
    payrollUsd: 4700000,
    spanOfControl: 8,
    successionCoveragePct: 68,
    attritionRiskPct: 13,
    healthStatus: 'Needs Attention',
    costCenter: 'OPS-120',
    description: 'Site mobilization, project field execution, and commissioning support.',
  },
  {
    id: 'dept-maint',
    parentId: 'div-ops',
    name: 'Maintenance Services',
    code: 'OPS-MNT',
    kind: 'Department',
    leader: 'Head, Maintenance Services',
    location: 'Port Harcourt',
    headcount: 88,
    openRoles: 2,
    budgetUsd: 5900000,
    payrollUsd: 1600000,
    spanOfControl: 6,
    successionCoveragePct: 83,
    attritionRiskPct: 7,
    healthStatus: 'Healthy',
    costCenter: 'OPS-130',
    description: 'Planned maintenance, shutdown support, and plant integrity resources.',
  },
  {
    id: 'dept-engineering',
    parentId: 'div-projects',
    name: 'Engineering Delivery',
    code: 'PRJ-ENG',
    kind: 'Department',
    leader: 'Head, Engineering Delivery',
    location: 'Lagos HQ',
    headcount: 129,
    openRoles: 5,
    budgetUsd: 9500000,
    payrollUsd: 3200000,
    spanOfControl: 7,
    successionCoveragePct: 72,
    attritionRiskPct: 10,
    healthStatus: 'Needs Attention',
    costCenter: 'PRJ-210',
    description: 'Multidiscipline engineering resources across civil, mechanical, and E&I.',
  },
  {
    id: 'dept-controls',
    parentId: 'div-projects',
    name: 'Project Controls',
    code: 'PRJ-CTL',
    kind: 'Department',
    leader: 'Head, Project Controls',
    location: 'Lagos HQ',
    headcount: 74,
    openRoles: 3,
    budgetUsd: 4700000,
    payrollUsd: 1500000,
    spanOfControl: 5,
    successionCoveragePct: 66,
    attritionRiskPct: 15,
    healthStatus: 'Critical',
    costCenter: 'PRJ-220',
    description: 'Planning, cost control, risk governance, and project reporting.',
  },
  {
    id: 'dept-hse',
    parentId: 'div-projects',
    name: 'HSE & Quality Assurance',
    code: 'PRJ-HSEQ',
    kind: 'Department',
    leader: 'Head, HSEQ',
    location: 'Lagos HQ',
    headcount: 61,
    openRoles: 4,
    budgetUsd: 3300000,
    payrollUsd: 1100000,
    spanOfControl: 5,
    successionCoveragePct: 71,
    attritionRiskPct: 9,
    healthStatus: 'Needs Attention',
    costCenter: 'PRJ-230',
    description: 'HSE, QA/QC, audits, and compliance assurance across projects.',
  },
  {
    id: 'dept-hr',
    parentId: 'div-corp',
    name: 'Human Capital',
    code: 'CSV-HR',
    kind: 'Department',
    leader: 'Head, Human Capital',
    location: 'Lagos HQ',
    headcount: 42,
    openRoles: 2,
    budgetUsd: 2100000,
    payrollUsd: 840000,
    spanOfControl: 4,
    successionCoveragePct: 88,
    attritionRiskPct: 5,
    healthStatus: 'Healthy',
    costCenter: 'CSV-310',
    description: 'Talent, rewards, workforce planning, HR operations, and employee relations.',
  },
  {
    id: 'dept-fin',
    parentId: 'div-corp',
    name: 'Finance & Accounting',
    code: 'CSV-FIN',
    kind: 'Department',
    leader: 'Head, Finance',
    location: 'Lagos HQ',
    headcount: 37,
    openRoles: 1,
    budgetUsd: 1900000,
    payrollUsd: 760000,
    spanOfControl: 4,
    successionCoveragePct: 84,
    attritionRiskPct: 4,
    healthStatus: 'Healthy',
    costCenter: 'CSV-320',
    description: 'Financial control, treasury, tax, and management reporting.',
  },
  {
    id: 'dept-it',
    parentId: 'div-corp',
    name: 'IT & Enterprise Systems',
    code: 'CSV-IT',
    kind: 'Department',
    leader: 'Head, IT',
    location: 'Lagos HQ',
    headcount: 31,
    openRoles: 3,
    budgetUsd: 2700000,
    payrollUsd: 620000,
    spanOfControl: 4,
    successionCoveragePct: 69,
    attritionRiskPct: 12,
    healthStatus: 'Needs Attention',
    costCenter: 'CSV-330',
    description: 'Infrastructure, ERP, HRIS, analytics, cybersecurity, and service delivery.',
  },
  {
    id: 'team-talent',
    parentId: 'dept-hr',
    name: 'Talent & Organization Development',
    code: 'CSV-HR-TOD',
    kind: 'Team',
    leader: 'Manager, Talent & OD',
    location: 'Lagos HQ',
    headcount: 12,
    openRoles: 1,
    budgetUsd: 620000,
    payrollUsd: 240000,
    spanOfControl: 3,
    successionCoveragePct: 90,
    attritionRiskPct: 4,
    healthStatus: 'Healthy',
    costCenter: 'CSV-311',
    description: 'Talent review, succession planning, leadership development, and workforce design.',
  },
  {
    id: 'team-hr-ops',
    parentId: 'dept-hr',
    name: 'HR Operations',
    code: 'CSV-HR-OPS',
    kind: 'Team',
    leader: 'Manager, HR Operations',
    location: 'Lagos HQ',
    headcount: 14,
    openRoles: 1,
    budgetUsd: 590000,
    payrollUsd: 260000,
    spanOfControl: 4,
    successionCoveragePct: 85,
    attritionRiskPct: 5,
    healthStatus: 'Healthy',
    costCenter: 'CSV-312',
    description: 'Employee lifecycle operations, data quality, shared HR services, and compliance.',
  },
  {
    id: 'team-planning',
    parentId: 'dept-controls',
    name: 'Planning & Controls Office',
    code: 'PRJ-CTL-PLN',
    kind: 'Team',
    leader: 'Manager, Planning',
    location: 'Lagos HQ',
    headcount: 19,
    openRoles: 2,
    budgetUsd: 980000,
    payrollUsd: 410000,
    spanOfControl: 3,
    successionCoveragePct: 58,
    attritionRiskPct: 18,
    healthStatus: 'Critical',
    costCenter: 'PRJ-221',
    description: 'Integrated planning, scheduling, dashboards, and milestone control.',
  },
  {
    id: 'team-cost',
    parentId: 'dept-controls',
    name: 'Cost & Commercial Controls',
    code: 'PRJ-CTL-CST',
    kind: 'Team',
    leader: 'Manager, Cost Control',
    location: 'Lagos HQ',
    headcount: 15,
    openRoles: 1,
    budgetUsd: 830000,
    payrollUsd: 340000,
    spanOfControl: 3,
    successionCoveragePct: 63,
    attritionRiskPct: 16,
    healthStatus: 'Needs Attention',
    costCenter: 'PRJ-222',
    description: 'Commercial governance, earned value, forecasting, and margin protection.',
  },
];

export const structureInsights: StructureInsight[] = [
  {
    id: 'ins-1',
    severity: 'high',
    title: 'Project Controls has elevated attrition risk and low succession coverage',
    recommendation: 'Prioritize retention plans, backfill readiness, and cross-training for critical controls roles.',
  },
  {
    id: 'ins-2',
    severity: 'medium',
    title: 'Field Execution is carrying a high open-role load',
    recommendation: 'Accelerate hiring for site-critical supervisors and review temporary workforce conversion options.',
  },
  {
    id: 'ins-3',
    severity: 'low',
    title: 'Human Capital shows strong coverage and healthy managerial span',
    recommendation: 'Use HR as the pilot team for structure governance scorecards and review workflows.',
  },
];

export const buildChildrenMap = (nodes: OrgNode[]) =>
  nodes.reduce<Record<string, OrgNode[]>>((acc, node) => {
    const key = node.parentId || 'root';
    acc[key] = acc[key] || [];
    acc[key].push(node);
    return acc;
  }, {});

export const buildNodeMap = (nodes: OrgNode[]) => new Map(nodes.map((node) => [node.id, node]));

export const buildEnhancedNodes = (nodes: OrgNode[]): EnhancedOrgNode[] => {
  const childrenByParent = buildChildrenMap(nodes);

  const descendantCount = (id: string): number => {
    const children = childrenByParent[id] || [];
    return children.reduce((total, child) => total + 1 + descendantCount(child.id), 0);
  };

  return nodes.map((node) => ({
    ...node,
    childCount: (childrenByParent[node.id] || []).length,
    descendantCount: descendantCount(node.id),
  }));
};

export const getCompanyStructureData = () => {
  const nodes = buildEnhancedNodes(organizationNodes);
  const totalHeadcount = nodes.reduce((sum, node) => sum + node.headcount, 0);
  const totalOpenRoles = nodes.reduce((sum, node) => sum + node.openRoles, 0);
  const avgSuccessionCoverage =
    Math.round((nodes.reduce((sum, node) => sum + node.successionCoveragePct, 0) / nodes.length) * 10) / 10;
  const avgSpan = Math.round((nodes.reduce((sum, node) => sum + node.spanOfControl, 0) / nodes.length) * 10) / 10;
  const criticalUnits = nodes.filter((node) => node.healthStatus === 'Critical').length;
  const attentionUnits = nodes.filter((node) => node.healthStatus === 'Needs Attention').length;

  return {
    generatedAt: new Date().toISOString(),
    permissions: {
      canEdit: true,
      canExport: true,
      canViewCosts: true,
    },
    summary: {
      totalUnits: nodes.length,
      totalHeadcount,
      totalOpenRoles,
      avgSuccessionCoverage,
      avgSpanOfControl: avgSpan,
      criticalUnits,
      attentionUnits,
    },
    filterOptions: {
      kinds: Array.from(new Set(nodes.map((node) => node.kind))),
      locations: Array.from(new Set(nodes.map((node) => node.location))).sort((a, b) => a.localeCompare(b)),
      healthStatuses: ['Healthy', 'Needs Attention', 'Critical'] as HealthStatus[],
    },
    nodes,
    insights: structureInsights,
  };
};

export const getDepartmentData = () => {
  const nodes = buildEnhancedNodes(organizationNodes);
  const nodeMap = buildNodeMap(organizationNodes);
  const departments = nodes
    .filter((node) => node.kind === 'Department')
    .map((department) => {
      const teams = nodes
        .filter((node) => node.parentId === department.id && node.kind === 'Team')
        .map((team) => ({
          id: team.id,
          name: team.name,
          leader: team.leader,
          headcount: team.headcount,
          openRoles: team.openRoles,
          healthStatus: team.healthStatus,
        }));

      const parent = department.parentId ? nodeMap.get(department.parentId) || null : null;
      const parentChain: string[] = [];
      let current = parent;
      while (current) {
        parentChain.unshift(current.name);
        current = current.parentId ? nodeMap.get(current.parentId) || null : null;
      }

      return {
        ...department,
        parentName: parent?.name || null,
        parentKind: parent?.kind || null,
        parentChain,
        teamCount: teams.length,
        teamHeadcount: teams.reduce((sum, team) => sum + team.headcount, 0),
        teams,
      } satisfies DepartmentRecord;
    });

  const totalHeadcount = departments.reduce((sum, department) => sum + department.headcount, 0);
  const totalOpenRoles = departments.reduce((sum, department) => sum + department.openRoles, 0);
  const totalTeams = departments.reduce((sum, department) => sum + department.teamCount, 0);
  const avgSuccessionCoverage =
    Math.round((departments.reduce((sum, department) => sum + department.successionCoveragePct, 0) / departments.length) * 10) / 10;
  const avgAttritionRisk =
    Math.round((departments.reduce((sum, department) => sum + department.attritionRiskPct, 0) / departments.length) * 10) / 10;
  const criticalDepartments = departments.filter((department) => department.healthStatus === 'Critical').length;
  const needsAttentionDepartments = departments.filter((department) => department.healthStatus === 'Needs Attention').length;

  const highestAttrition = [...departments].sort((a, b) => b.attritionRiskPct - a.attritionRiskPct)[0];
  const weakestCoverage = [...departments].sort((a, b) => a.successionCoveragePct - b.successionCoveragePct)[0];
  const biggestHiringLoad = [...departments].sort((a, b) => b.openRoles - a.openRoles)[0];

  const insights: StructureInsight[] = [
    {
      id: 'dept-ins-1',
      severity: highestAttrition && highestAttrition.attritionRiskPct >= 14 ? 'high' : 'medium',
      title: `${highestAttrition?.name || 'Department'} has the highest attrition risk`,
      recommendation: 'Review leadership capacity, retention levers, and continuity coverage for critical roles.',
    },
    {
      id: 'dept-ins-2',
      severity: weakestCoverage && weakestCoverage.successionCoveragePct <= 70 ? 'high' : 'medium',
      title: `${weakestCoverage?.name || 'Department'} has the weakest succession coverage`,
      recommendation: 'Strengthen successor readiness, internal mobility plans, and capability depth.',
    },
    {
      id: 'dept-ins-3',
      severity: biggestHiringLoad && biggestHiringLoad.openRoles >= 4 ? 'medium' : 'low',
      title: `${biggestHiringLoad?.name || 'Department'} is carrying the largest hiring load`,
      recommendation: 'Prioritize approved recruitment and monitor delivery risk from vacant roles.',
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    permissions: {
      canEdit: true,
      canExport: true,
      canViewCosts: true,
    },
    summary: {
      totalDepartments: departments.length,
      totalHeadcount,
      totalOpenRoles,
      totalTeams,
      avgSuccessionCoverage,
      avgAttritionRisk,
      criticalDepartments,
      needsAttentionDepartments,
    },
    filterOptions: {
      locations: Array.from(new Set(departments.map((department) => department.location))).sort((a, b) => a.localeCompare(b)),
      healthStatuses: ['Healthy', 'Needs Attention', 'Critical'] as HealthStatus[],
      parentUnits: Array.from(new Set(departments.map((department) => department.parentName).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b)),
    },
    departments,
    insights,
  };
};

export const getUnitsSectionsData = () => {
  const nodes = buildEnhancedNodes(organizationNodes);
  const nodeMap = buildNodeMap(organizationNodes);
  const childrenByParent = buildChildrenMap(organizationNodes);

  const getParentChain = (parentId: string | null) => {
    const chain: string[] = [];
    let current = parentId ? nodeMap.get(parentId) || null : null;
    while (current) {
      chain.unshift(current.name);
      current = current.parentId ? nodeMap.get(current.parentId) || null : null;
    }
    return chain;
  };

  const getDescendants = (id: string): OrgNode[] => {
    const children = childrenByParent[id] || [];
    return children.flatMap((child) => [child, ...getDescendants(child.id)]);
  };

  const units: UnitSectionRecord[] = nodes
    .filter((node) => node.kind === 'Business Unit')
    .map((unit) => {
      const descendants = getDescendants(unit.id);
      const departments = descendants.filter((node) => node.kind === 'Department');
      const teams = descendants.filter((node) => node.kind === 'Team');
      const parent = unit.parentId ? nodeMap.get(unit.parentId) || null : null;

      return {
        ...unit,
        recordType: 'Unit',
        parentName: parent?.name || null,
        parentKind: parent?.kind || null,
        parentChain: getParentChain(unit.parentId),
        relatedDepartmentCount: departments.length,
        relatedTeamCount: teams.length,
        relatedHeadcount: descendants.reduce((sum, item) => sum + item.headcount, 0),
        relatedItems: descendants.map((item) => ({
          id: item.id,
          name: item.name,
          kind: item.kind,
          leader: item.leader,
          headcount: item.headcount,
          openRoles: item.openRoles,
          healthStatus: item.healthStatus,
        })),
      };
    });

  const sections: UnitSectionRecord[] = nodes
    .filter((node) => node.kind === 'Team')
    .map((section) => {
      const parent = section.parentId ? nodeMap.get(section.parentId) || null : null;

      return {
        ...section,
        recordType: 'Section',
        parentName: parent?.name || null,
        parentKind: parent?.kind || null,
        parentChain: getParentChain(section.parentId),
        relatedDepartmentCount: parent?.kind === 'Department' ? 1 : 0,
        relatedTeamCount: 0,
        relatedHeadcount: 0,
        relatedItems: [],
      };
    });

  const records = [...units, ...sections];
  const totalHeadcount = records.reduce((sum, record) => sum + record.headcount, 0);
  const totalOpenRoles = records.reduce((sum, record) => sum + record.openRoles, 0);
  const avgSuccessionCoverage =
    Math.round((records.reduce((sum, record) => sum + record.successionCoveragePct, 0) / records.length) * 10) / 10;
  const avgAttritionRisk =
    Math.round((records.reduce((sum, record) => sum + record.attritionRiskPct, 0) / records.length) * 10) / 10;

  const highestRiskSection = [...sections].sort((a, b) => b.attritionRiskPct - a.attritionRiskPct)[0];
  const weakestUnitCoverage = [...units].sort((a, b) => a.successionCoveragePct - b.successionCoveragePct)[0];
  const biggestHeadcountUnit = [...units].sort((a, b) => b.headcount - a.headcount)[0];

  const insights: StructureInsight[] = [
    {
      id: 'unit-sec-ins-1',
      severity: highestRiskSection && highestRiskSection.attritionRiskPct >= 16 ? 'high' : 'medium',
      title: `${highestRiskSection?.name || 'A section'} shows the highest attrition risk`,
      recommendation: 'Review frontline leadership continuity, coverage depth, and section-level retention actions.',
    },
    {
      id: 'unit-sec-ins-2',
      severity: weakestUnitCoverage && weakestUnitCoverage.successionCoveragePct <= 70 ? 'high' : 'medium',
      title: `${weakestUnitCoverage?.name || 'A unit'} has the weakest succession coverage among units`,
      recommendation: 'Strengthen pipeline depth for unit leadership and critical specialist roles.',
    },
    {
      id: 'unit-sec-ins-3',
      severity: biggestHeadcountUnit && biggestHeadcountUnit.headcount >= 180 ? 'medium' : 'low',
      title: `${biggestHeadcountUnit?.name || 'A unit'} carries the largest workforce footprint`,
      recommendation: 'Monitor governance span, workload balancing, and workforce planning for the largest unit.',
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    permissions: {
      canEdit: true,
      canExport: true,
      canViewCosts: true,
    },
    summary: {
      totalRecords: records.length,
      totalUnits: units.length,
      totalSections: sections.length,
      totalHeadcount,
      totalOpenRoles,
      avgSuccessionCoverage,
      avgAttritionRisk,
    },
    filterOptions: {
      recordTypes: ['Unit', 'Section'] as Array<'Unit' | 'Section'>,
      locations: Array.from(new Set(records.map((record) => record.location))).sort((a, b) => a.localeCompare(b)),
      healthStatuses: ['Healthy', 'Needs Attention', 'Critical'] as HealthStatus[],
      parentUnits: Array.from(new Set(records.map((record) => record.parentName).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b)),
    },
    records,
    insights,
  };
};

export const getLocationsSitesData = () => {
  const nodes = buildEnhancedNodes(organizationNodes);
  const kindRank: Record<NodeKind, number> = {
    Company: 0,
    Division: 1,
    'Business Unit': 2,
    Department: 3,
    Team: 4,
  };
  const locationMeta: Record<
    string,
    { region: string; siteCategory: 'Head Office' | 'Operational Hub' | 'Yard' | 'Field Site'; description: string }
  > = {
    'Lagos HQ': {
      region: 'Lagos State',
      siteCategory: 'Head Office',
      description: 'Corporate headquarters and shared-services hub supporting enterprise leadership and control functions.',
    },
    'Port Harcourt': {
      region: 'Rivers State',
      siteCategory: 'Operational Hub',
      description: 'Operational coordination hub for maintenance, field support, and regional execution oversight.',
    },
    'Warri Yard': {
      region: 'Delta State',
      siteCategory: 'Yard',
      description: 'Fabrication and yard operations footprint supporting structural and production delivery.',
    },
    'Bonny Island': {
      region: 'Rivers State',
      siteCategory: 'Field Site',
      description: 'Field execution footprint for site mobilization, project delivery, and commissioning support.',
    },
  };

  const average = (values: number[]) => Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
  const resolveHealth = (statuses: HealthStatus[]): HealthStatus =>
    statuses.includes('Critical') ? 'Critical' : statuses.includes('Needs Attention') ? 'Needs Attention' : 'Healthy';

  const siteRecords: LocationSiteRecord[] = Object.entries(locationMeta).map(([siteName, meta]) => {
    const siteNodes = nodes.filter((node) => node.location === siteName);
    const leaderNode = [...siteNodes].sort((a, b) => kindRank[a.kind] - kindRank[b.kind])[0];

    return {
      id: `site-${siteName.toLowerCase().replace(/\s+/g, '-')}`,
      name: siteName,
      recordType: 'Site',
      parentName: meta.region,
      parentChain: [meta.region],
      region: meta.region,
      country: 'Nigeria',
      siteCategory: meta.siteCategory,
      leader: leaderNode?.leader || 'Unassigned',
      location: siteName,
      headcount: siteNodes.reduce((sum, node) => sum + node.headcount, 0),
      openRoles: siteNodes.reduce((sum, node) => sum + node.openRoles, 0),
      budgetUsd: siteNodes.reduce((sum, node) => sum + node.budgetUsd, 0),
      payrollUsd: siteNodes.reduce((sum, node) => sum + node.payrollUsd, 0),
      spanOfControl: siteNodes.length ? average(siteNodes.map((node) => node.spanOfControl)) : 0,
      successionCoveragePct: siteNodes.length ? average(siteNodes.map((node) => node.successionCoveragePct)) : 0,
      attritionRiskPct: siteNodes.length ? average(siteNodes.map((node) => node.attritionRiskPct)) : 0,
      healthStatus: resolveHealth(siteNodes.map((node) => node.healthStatus)),
      costCenter: leaderNode?.costCenter || 'N/A',
      description: meta.description,
      nodeCount: siteNodes.length,
      divisionCount: siteNodes.filter((node) => node.kind === 'Division').length,
      businessUnitCount: siteNodes.filter((node) => node.kind === 'Business Unit').length,
      departmentCount: siteNodes.filter((node) => node.kind === 'Department').length,
      teamCount: siteNodes.filter((node) => node.kind === 'Team').length,
      relatedItems: siteNodes.map((node) => ({
        id: node.id,
        name: node.name,
        kind: node.kind,
        leader: node.leader,
        headcount: node.headcount,
        openRoles: node.openRoles,
        healthStatus: node.healthStatus,
      })),
    };
  });

  const locationGroups = Array.from(new Set(siteRecords.map((site) => site.region)));
  const locationRecords: LocationSiteRecord[] = locationGroups.map((region) => {
    const regionSites = siteRecords.filter((site) => site.region === region);
    const totalHeadcount = regionSites.reduce((sum, site) => sum + site.headcount, 0);
    const totalOpenRoles = regionSites.reduce((sum, site) => sum + site.openRoles, 0);

    return {
      id: `location-${region.toLowerCase().replace(/\s+/g, '-')}`,
      name: region,
      recordType: 'Location',
      parentName: 'Nigeria',
      parentChain: ['Nigeria'],
      region,
      country: 'Nigeria',
      siteCategory: 'State',
      leader: regionSites.sort((a, b) => b.headcount - a.headcount)[0]?.leader || 'Unassigned',
      location: region,
      headcount: totalHeadcount,
      openRoles: totalOpenRoles,
      budgetUsd: regionSites.reduce((sum, site) => sum + site.budgetUsd, 0),
      payrollUsd: regionSites.reduce((sum, site) => sum + site.payrollUsd, 0),
      spanOfControl: regionSites.length ? average(regionSites.map((site) => site.spanOfControl)) : 0,
      successionCoveragePct: regionSites.length ? average(regionSites.map((site) => site.successionCoveragePct)) : 0,
      attritionRiskPct: regionSites.length ? average(regionSites.map((site) => site.attritionRiskPct)) : 0,
      healthStatus: resolveHealth(regionSites.map((site) => site.healthStatus)),
      costCenter: 'MULTI-SITE',
      description: `Regional location roll-up covering ${regionSites.length} operating site${regionSites.length === 1 ? '' : 's'}.`,
      nodeCount: regionSites.reduce((sum, site) => sum + site.nodeCount, 0),
      divisionCount: regionSites.reduce((sum, site) => sum + site.divisionCount, 0),
      businessUnitCount: regionSites.reduce((sum, site) => sum + site.businessUnitCount, 0),
      departmentCount: regionSites.reduce((sum, site) => sum + site.departmentCount, 0),
      teamCount: regionSites.reduce((sum, site) => sum + site.teamCount, 0),
      relatedItems: regionSites.map((site) => ({
        id: site.id,
        name: site.name,
        kind: 'Site',
        leader: site.leader,
        headcount: site.headcount,
        openRoles: site.openRoles,
        healthStatus: site.healthStatus,
      })),
    };
  });

  const records = [...locationRecords, ...siteRecords];
  const highestHiringSite = [...siteRecords].sort((a, b) => b.openRoles - a.openRoles)[0];
  const highestRiskSite = [...siteRecords].sort((a, b) => b.attritionRiskPct - a.attritionRiskPct)[0];
  const largestLocation = [...locationRecords].sort((a, b) => b.headcount - a.headcount)[0];

  const insights: StructureInsight[] = [
    {
      id: 'loc-site-ins-1',
      severity: highestHiringSite && highestHiringSite.openRoles >= 10 ? 'high' : 'medium',
      title: `${highestHiringSite?.name || 'A site'} is carrying the largest hiring load`,
      recommendation: 'Prioritize location-based recruitment planning and assess delivery risk from open site-critical roles.',
    },
    {
      id: 'loc-site-ins-2',
      severity: highestRiskSite && highestRiskSite.attritionRiskPct >= 12 ? 'high' : 'medium',
      title: `${highestRiskSite?.name || 'A site'} shows the highest attrition pressure`,
      recommendation: 'Review site leadership resilience, workforce conditions, and retention actions for critical teams.',
    },
    {
      id: 'loc-site-ins-3',
      severity: largestLocation && largestLocation.headcount >= 1000 ? 'medium' : 'low',
      title: `${largestLocation?.name || 'A location'} carries the largest workforce footprint`,
      recommendation: 'Strengthen governance controls, succession oversight, and resource planning for the largest location cluster.',
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    permissions: {
      canEdit: true,
      canExport: true,
      canViewCosts: true,
    },
    summary: {
      totalRecords: records.length,
      totalLocations: locationRecords.length,
      totalSites: siteRecords.length,
      totalHeadcount: records.reduce((sum, record) => sum + record.headcount, 0),
      totalOpenRoles: records.reduce((sum, record) => sum + record.openRoles, 0),
      avgSuccessionCoverage: average(records.map((record) => record.successionCoveragePct)),
      avgAttritionRisk: average(records.map((record) => record.attritionRiskPct)),
    },
    filterOptions: {
      recordTypes: ['Location', 'Site'] as Array<'Location' | 'Site'>,
      regions: locationGroups.sort((a, b) => a.localeCompare(b)),
      siteCategories: Array.from(new Set(records.map((record) => record.siteCategory))).sort((a, b) => a.localeCompare(b)),
      healthStatuses: ['Healthy', 'Needs Attention', 'Critical'] as HealthStatus[],
    },
    records,
    insights,
  };
};

export const getJobGradesData = () => {
  const grades: JobGradeRecord[] = [
    {
      id: 'jg-01',
      code: 'G01',
      name: 'Executive Leadership',
      family: 'Executive',
      level: 'Strategic',
      minSalaryUsd: 180000,
      midpointSalaryUsd: 235000,
      maxSalaryUsd: 310000,
      employeeCount: 6,
      openPositions: 1,
      successionCoveragePct: 78,
      attritionRiskPct: 6,
      internalMobilityPct: 12,
      averageTenureYears: 9.4,
      femaleRepresentationPct: 33,
      healthStatus: 'Healthy',
      benchmarkPosition: 'Executive Director',
      nextGradeCode: null,
      keyRoles: ['Executive Director, Operations', 'Executive Director, Projects', 'Executive Director, Corporate Services'],
      gradeMix: [
        { unit: 'Corporate Services', headcount: 2 },
        { unit: 'Projects Division', headcount: 2 },
        { unit: 'Operations Division', headcount: 2 },
      ],
      description: 'Top strategic leadership grade for enterprise direction, governance, and P&L accountability.',
    },
    {
      id: 'jg-02',
      code: 'G02',
      name: 'General Management',
      family: 'Management',
      level: 'Senior',
      minSalaryUsd: 105000,
      midpointSalaryUsd: 138000,
      maxSalaryUsd: 172000,
      employeeCount: 18,
      openPositions: 2,
      successionCoveragePct: 72,
      attritionRiskPct: 8,
      internalMobilityPct: 18,
      averageTenureYears: 7.8,
      femaleRepresentationPct: 28,
      healthStatus: 'Needs Attention',
      benchmarkPosition: 'General Manager / Head of Function',
      nextGradeCode: 'G01',
      keyRoles: ['GM, Fabrication', 'GM, Field Execution', 'Head, Human Capital'],
      gradeMix: [
        { unit: 'Operations Division', headcount: 8 },
        { unit: 'Projects Division', headcount: 5 },
        { unit: 'Corporate Services', headcount: 5 },
      ],
      description: 'Senior leadership grade for business-unit heads and enterprise functional leads.',
    },
    {
      id: 'jg-03',
      code: 'G03',
      name: 'Functional Leadership',
      family: 'Management',
      level: 'Senior',
      minSalaryUsd: 72000,
      midpointSalaryUsd: 91000,
      maxSalaryUsd: 118000,
      employeeCount: 41,
      openPositions: 5,
      successionCoveragePct: 69,
      attritionRiskPct: 11,
      internalMobilityPct: 22,
      averageTenureYears: 6.1,
      femaleRepresentationPct: 31,
      healthStatus: 'Needs Attention',
      benchmarkPosition: 'Manager / Lead Specialist',
      nextGradeCode: 'G02',
      keyRoles: ['Manager, HR Operations', 'Manager, Planning', 'Lead Project Engineer'],
      gradeMix: [
        { unit: 'Projects Division', headcount: 17 },
        { unit: 'Operations Division', headcount: 12 },
        { unit: 'Corporate Services', headcount: 12 },
      ],
      description: 'Functional leadership grade for managers and senior specialists running teams or critical disciplines.',
    },
    {
      id: 'jg-04',
      code: 'G04',
      name: 'Professional Core',
      family: 'Professional',
      level: 'Mid',
      minSalaryUsd: 36000,
      midpointSalaryUsd: 47000,
      maxSalaryUsd: 62000,
      employeeCount: 146,
      openPositions: 9,
      successionCoveragePct: 74,
      attritionRiskPct: 10,
      internalMobilityPct: 26,
      averageTenureYears: 4.8,
      femaleRepresentationPct: 36,
      healthStatus: 'Healthy',
      benchmarkPosition: 'Engineer / Analyst / Officer',
      nextGradeCode: 'G03',
      keyRoles: ['Project Engineer', 'HR Analyst', 'Cost Controller'],
      gradeMix: [
        { unit: 'Projects Division', headcount: 61 },
        { unit: 'Operations Division', headcount: 47 },
        { unit: 'Corporate Services', headcount: 38 },
      ],
      description: 'Core professional grade for engineers, analysts, commercial specialists, and experienced officers.',
    },
    {
      id: 'jg-05',
      code: 'G05',
      name: 'Technical Specialists',
      family: 'Technical',
      level: 'Mid',
      minSalaryUsd: 28000,
      midpointSalaryUsd: 36500,
      maxSalaryUsd: 45500,
      employeeCount: 212,
      openPositions: 14,
      successionCoveragePct: 63,
      attritionRiskPct: 14,
      internalMobilityPct: 19,
      averageTenureYears: 4.1,
      femaleRepresentationPct: 18,
      healthStatus: 'Critical',
      benchmarkPosition: 'Supervisor / Specialist Technician',
      nextGradeCode: 'G04',
      keyRoles: ['Site Supervisor', 'Instrument Specialist', 'QA Specialist'],
      gradeMix: [
        { unit: 'Operations Division', headcount: 118 },
        { unit: 'Projects Division', headcount: 66 },
        { unit: 'Corporate Services', headcount: 28 },
      ],
      description: 'High-demand specialist and supervisory grade supporting field execution, maintenance, and technical delivery.',
    },
    {
      id: 'jg-06',
      code: 'G06',
      name: 'Operations Support',
      family: 'Operations Support',
      level: 'Entry',
      minSalaryUsd: 14000,
      midpointSalaryUsd: 18800,
      maxSalaryUsd: 24500,
      employeeCount: 327,
      openPositions: 11,
      successionCoveragePct: 71,
      attritionRiskPct: 9,
      internalMobilityPct: 24,
      averageTenureYears: 3.6,
      femaleRepresentationPct: 29,
      healthStatus: 'Healthy',
      benchmarkPosition: 'Coordinator / Assistant / Technician',
      nextGradeCode: 'G05',
      keyRoles: ['Technician', 'Project Coordinator', 'Administrative Officer'],
      gradeMix: [
        { unit: 'Operations Division', headcount: 149 },
        { unit: 'Projects Division', headcount: 96 },
        { unit: 'Corporate Services', headcount: 82 },
      ],
      description: 'Entry and support grade covering coordinators, assistants, technicians, and junior operational staff.',
    },
  ];

  const totalEmployees = grades.reduce((sum, grade) => sum + grade.employeeCount, 0);
  const totalOpenPositions = grades.reduce((sum, grade) => sum + grade.openPositions, 0);
  const avgSuccessionCoverage = Math.round((grades.reduce((sum, grade) => sum + grade.successionCoveragePct, 0) / grades.length) * 10) / 10;
  const avgAttritionRisk = Math.round((grades.reduce((sum, grade) => sum + grade.attritionRiskPct, 0) / grades.length) * 10) / 10;
  const avgMobility = Math.round((grades.reduce((sum, grade) => sum + grade.internalMobilityPct, 0) / grades.length) * 10) / 10;

  const mostPressuredGrade = [...grades].sort((a, b) => b.attritionRiskPct - a.attritionRiskPct)[0];
  const weakestCoverageGrade = [...grades].sort((a, b) => a.successionCoveragePct - b.successionCoveragePct)[0];
  const biggestPopulationGrade = [...grades].sort((a, b) => b.employeeCount - a.employeeCount)[0];

  const insights: StructureInsight[] = [
    {
      id: 'grade-ins-1',
      severity: mostPressuredGrade && mostPressuredGrade.attritionRiskPct >= 14 ? 'high' : 'medium',
      title: `${mostPressuredGrade?.code || 'A grade'} is under the highest attrition pressure`,
      recommendation: 'Review reward competitiveness, supervisory capacity, and targeted retention controls for the grade.',
    },
    {
      id: 'grade-ins-2',
      severity: weakestCoverageGrade && weakestCoverageGrade.successionCoveragePct <= 65 ? 'high' : 'medium',
      title: `${weakestCoverageGrade?.code || 'A grade'} has the weakest succession coverage`,
      recommendation: 'Strengthen pipeline readiness, development plans, and internal mobility pathways for feeder roles.',
    },
    {
      id: 'grade-ins-3',
      severity: biggestPopulationGrade && biggestPopulationGrade.employeeCount >= 250 ? 'medium' : 'low',
      title: `${biggestPopulationGrade?.code || 'A grade'} carries the largest workforce concentration`,
      recommendation: 'Use this grade as a control point for workforce planning, grade drift monitoring, and compensation governance.',
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    permissions: {
      canEdit: true,
      canExport: true,
      canViewCosts: true,
    },
    summary: {
      totalGrades: grades.length,
      totalEmployees,
      totalOpenPositions,
      avgSuccessionCoverage,
      avgAttritionRisk,
      avgInternalMobility: avgMobility,
      criticalGrades: grades.filter((grade) => grade.healthStatus === 'Critical').length,
      needsAttentionGrades: grades.filter((grade) => grade.healthStatus === 'Needs Attention').length,
    },
    filterOptions: {
      families: Array.from(new Set(grades.map((grade) => grade.family))),
      levels: Array.from(new Set(grades.map((grade) => grade.level))),
      healthStatuses: ['Healthy', 'Needs Attention', 'Critical'] as HealthStatus[],
    },
    grades,
    insights,
  };
};

export const getJobTitlesData = () => {
  const titles: JobTitleRecord[] = [
    {
      id: 'jt-001',
      code: 'JT-001',
      title: 'Executive Director, Operations',
      family: 'Executive',
      level: 'Strategic',
      gradeCode: 'G01',
      gradeName: 'Executive Leadership',
      reportingLevel: 'Enterprise',
      benchmarkSalaryUsd: 248000,
      employeeCount: 1,
      openPositions: 0,
      departmentCount: 4,
      locationCount: 2,
      successionCoveragePct: 78,
      attritionRiskPct: 5,
      internalMobilityPct: 10,
      healthStatus: 'Healthy',
      standardizationStatus: 'Standard',
      benchmarkPosition: 'Executive Director',
      jobPurpose: 'Provides enterprise leadership for operations delivery, asset readiness, and regional execution performance.',
      commonLocations: ['Port Harcourt', 'Lagos HQ'],
      departments: ['Operations Division', 'Fabrication', 'Field Execution', 'Maintenance'],
      keyResponsibilities: ['Lead operations strategy', 'Own delivery performance', 'Drive governance and risk controls'],
    },
    {
      id: 'jt-002',
      code: 'JT-002',
      title: 'General Manager, Fabrication',
      family: 'Management',
      level: 'Senior',
      gradeCode: 'G02',
      gradeName: 'General Management',
      reportingLevel: 'Division',
      benchmarkSalaryUsd: 142000,
      employeeCount: 1,
      openPositions: 0,
      departmentCount: 3,
      locationCount: 1,
      successionCoveragePct: 71,
      attritionRiskPct: 7,
      internalMobilityPct: 14,
      healthStatus: 'Healthy',
      standardizationStatus: 'Standard',
      benchmarkPosition: 'General Manager / Head of Function',
      jobPurpose: 'Leads fabrication planning, yard operations, and production quality across the fabrication footprint.',
      commonLocations: ['Warri Yard'],
      departments: ['Fabrication', 'Quality Assurance', 'Project Controls'],
      keyResponsibilities: ['Manage yard operations', 'Control fabrication budget', 'Coordinate delivery milestones'],
    },
    {
      id: 'jt-003',
      code: 'JT-003',
      title: 'Head, Human Capital',
      family: 'Management',
      level: 'Senior',
      gradeCode: 'G02',
      gradeName: 'General Management',
      reportingLevel: 'Enterprise',
      benchmarkSalaryUsd: 136000,
      employeeCount: 1,
      openPositions: 1,
      departmentCount: 2,
      locationCount: 2,
      successionCoveragePct: 68,
      attritionRiskPct: 8,
      internalMobilityPct: 18,
      healthStatus: 'Needs Attention',
      standardizationStatus: 'Standard',
      benchmarkPosition: 'General Manager / Head of Function',
      jobPurpose: 'Owns workforce planning, talent governance, employee relations, and HR service delivery across the enterprise.',
      commonLocations: ['Lagos HQ', 'Port Harcourt'],
      departments: ['Human Capital', 'Corporate Services'],
      keyResponsibilities: ['Lead HR strategy', 'Control people policies', 'Drive talent and succession planning'],
    },
    {
      id: 'jt-004',
      code: 'JT-004',
      title: 'Lead Project Engineer',
      family: 'Management',
      level: 'Senior',
      gradeCode: 'G03',
      gradeName: 'Functional Leadership',
      reportingLevel: 'Department',
      benchmarkSalaryUsd: 94500,
      employeeCount: 6,
      openPositions: 2,
      departmentCount: 2,
      locationCount: 3,
      successionCoveragePct: 66,
      attritionRiskPct: 11,
      internalMobilityPct: 20,
      healthStatus: 'Needs Attention',
      standardizationStatus: 'Standard',
      benchmarkPosition: 'Manager / Lead Specialist',
      jobPurpose: 'Directs engineering workpacks, technical assurance, and multi-discipline project execution for major jobs.',
      commonLocations: ['Lagos HQ', 'Bonny Island', 'Port Harcourt'],
      departments: ['Projects', 'Project Controls'],
      keyResponsibilities: ['Lead engineering scope', 'Coordinate discipline leads', 'Assure schedule and quality alignment'],
    },
    {
      id: 'jt-005',
      code: 'JT-005',
      title: 'Manager, Planning',
      family: 'Management',
      level: 'Senior',
      gradeCode: 'G03',
      gradeName: 'Functional Leadership',
      reportingLevel: 'Department',
      benchmarkSalaryUsd: 90200,
      employeeCount: 3,
      openPositions: 1,
      departmentCount: 2,
      locationCount: 2,
      successionCoveragePct: 64,
      attritionRiskPct: 10,
      internalMobilityPct: 19,
      healthStatus: 'Needs Attention',
      standardizationStatus: 'Variant',
      benchmarkPosition: 'Manager / Lead Specialist',
      jobPurpose: 'Owns integrated planning, progress measurement, schedule recovery, and planning governance across projects.',
      commonLocations: ['Lagos HQ', 'Port Harcourt'],
      departments: ['Project Controls', 'Projects'],
      keyResponsibilities: ['Control project schedules', 'Run performance reporting', 'Manage recovery planning'],
    },
    {
      id: 'jt-006',
      code: 'JT-006',
      title: 'Project Engineer',
      family: 'Professional',
      level: 'Mid',
      gradeCode: 'G04',
      gradeName: 'Professional Core',
      reportingLevel: 'Department',
      benchmarkSalaryUsd: 48800,
      employeeCount: 38,
      openPositions: 4,
      departmentCount: 3,
      locationCount: 4,
      successionCoveragePct: 73,
      attritionRiskPct: 10,
      internalMobilityPct: 28,
      healthStatus: 'Healthy',
      standardizationStatus: 'Standard',
      benchmarkPosition: 'Engineer / Analyst / Officer',
      jobPurpose: 'Delivers assigned engineering packages, technical coordination, and field support across active projects.',
      commonLocations: ['Lagos HQ', 'Port Harcourt', 'Warri Yard', 'Bonny Island'],
      departments: ['Projects', 'Civil Engineering', 'Mechanical Engineering'],
      keyResponsibilities: ['Prepare technical deliverables', 'Support site execution', 'Coordinate with planners and QA'],
    },
    {
      id: 'jt-007',
      code: 'JT-007',
      title: 'HR Analyst',
      family: 'Professional',
      level: 'Mid',
      gradeCode: 'G04',
      gradeName: 'Professional Core',
      reportingLevel: 'Department',
      benchmarkSalaryUsd: 45200,
      employeeCount: 9,
      openPositions: 1,
      departmentCount: 1,
      locationCount: 2,
      successionCoveragePct: 75,
      attritionRiskPct: 8,
      internalMobilityPct: 24,
      healthStatus: 'Healthy',
      standardizationStatus: 'Standard',
      benchmarkPosition: 'Engineer / Analyst / Officer',
      jobPurpose: 'Supports people analytics, org reporting, workforce planning, and employee lifecycle data quality.',
      commonLocations: ['Lagos HQ', 'Port Harcourt'],
      departments: ['Human Capital'],
      keyResponsibilities: ['Produce workforce analytics', 'Maintain HR data quality', 'Support talent reporting'],
    },
    {
      id: 'jt-008',
      code: 'JT-008',
      title: 'Cost Controller',
      family: 'Professional',
      level: 'Mid',
      gradeCode: 'G04',
      gradeName: 'Professional Core',
      reportingLevel: 'Department',
      benchmarkSalaryUsd: 47600,
      employeeCount: 11,
      openPositions: 1,
      departmentCount: 2,
      locationCount: 2,
      successionCoveragePct: 72,
      attritionRiskPct: 9,
      internalMobilityPct: 25,
      healthStatus: 'Healthy',
      standardizationStatus: 'Standard',
      benchmarkPosition: 'Engineer / Analyst / Officer',
      jobPurpose: 'Tracks project cost performance, commitments, forecasts, and cost-control governance.',
      commonLocations: ['Lagos HQ', 'Port Harcourt'],
      departments: ['Finance', 'Project Controls'],
      keyResponsibilities: ['Monitor cost variance', 'Prepare forecasts', 'Support earned value reporting'],
    },
    {
      id: 'jt-009',
      code: 'JT-009',
      title: 'Site Supervisor',
      family: 'Technical',
      level: 'Mid',
      gradeCode: 'G05',
      gradeName: 'Technical Specialists',
      reportingLevel: 'Team',
      benchmarkSalaryUsd: 37200,
      employeeCount: 27,
      openPositions: 5,
      departmentCount: 4,
      locationCount: 3,
      successionCoveragePct: 61,
      attritionRiskPct: 14,
      internalMobilityPct: 17,
      healthStatus: 'Critical',
      standardizationStatus: 'Needs Review',
      benchmarkPosition: 'Supervisor / Specialist Technician',
      jobPurpose: 'Supervises site crews, workfronts, safety compliance, and daily execution quality in the field.',
      commonLocations: ['Bonny Island', 'Port Harcourt', 'Warri Yard'],
      departments: ['Field Execution', 'Maintenance', 'HSE', 'Projects'],
      keyResponsibilities: ['Supervise crews', 'Enforce safety controls', 'Track workfront productivity'],
    },
    {
      id: 'jt-010',
      code: 'JT-010',
      title: 'Instrument Specialist',
      family: 'Technical',
      level: 'Mid',
      gradeCode: 'G05',
      gradeName: 'Technical Specialists',
      reportingLevel: 'Team',
      benchmarkSalaryUsd: 38400,
      employeeCount: 19,
      openPositions: 4,
      departmentCount: 2,
      locationCount: 3,
      successionCoveragePct: 62,
      attritionRiskPct: 13,
      internalMobilityPct: 18,
      healthStatus: 'Needs Attention',
      standardizationStatus: 'Standard',
      benchmarkPosition: 'Supervisor / Specialist Technician',
      jobPurpose: 'Maintains instrumentation integrity, commissioning readiness, and troubleshooting for operating assets and projects.',
      commonLocations: ['Port Harcourt', 'Bonny Island', 'Warri Yard'],
      departments: ['Electrical & Instrumentation', 'Maintenance'],
      keyResponsibilities: ['Maintain instrument systems', 'Support commissioning', 'Troubleshoot field issues'],
    },
    {
      id: 'jt-011',
      code: 'JT-011',
      title: 'Project Coordinator',
      family: 'Operations Support',
      level: 'Entry',
      gradeCode: 'G06',
      gradeName: 'Operations Support',
      reportingLevel: 'Department',
      benchmarkSalaryUsd: 19100,
      employeeCount: 34,
      openPositions: 3,
      departmentCount: 3,
      locationCount: 4,
      successionCoveragePct: 72,
      attritionRiskPct: 9,
      internalMobilityPct: 26,
      healthStatus: 'Healthy',
      standardizationStatus: 'Variant',
      benchmarkPosition: 'Coordinator / Assistant / Technician',
      jobPurpose: 'Coordinates administrative, scheduling, logistics, and reporting tasks that support project execution teams.',
      commonLocations: ['Lagos HQ', 'Port Harcourt', 'Warri Yard', 'Bonny Island'],
      departments: ['Projects', 'Project Controls', 'Operations'],
      keyResponsibilities: ['Coordinate execution support', 'Manage reporting packs', 'Track action closures'],
    },
    {
      id: 'jt-012',
      code: 'JT-012',
      title: 'Administrative Officer',
      family: 'Operations Support',
      level: 'Entry',
      gradeCode: 'G06',
      gradeName: 'Operations Support',
      reportingLevel: 'Department',
      benchmarkSalaryUsd: 17600,
      employeeCount: 25,
      openPositions: 2,
      departmentCount: 4,
      locationCount: 3,
      successionCoveragePct: 74,
      attritionRiskPct: 8,
      internalMobilityPct: 23,
      healthStatus: 'Healthy',
      standardizationStatus: 'Standard',
      benchmarkPosition: 'Coordinator / Assistant / Technician',
      jobPurpose: 'Supports records, office administration, workflow coordination, and service operations across functions.',
      commonLocations: ['Lagos HQ', 'Port Harcourt', 'Warri Yard'],
      departments: ['Human Capital', 'Finance', 'Procurement', 'Legal & Compliance'],
      keyResponsibilities: ['Support office workflows', 'Maintain records', 'Coordinate routine administration'],
    },
  ];

  const totalEmployees = titles.reduce((sum, title) => sum + title.employeeCount, 0);
  const totalOpenPositions = titles.reduce((sum, title) => sum + title.openPositions, 0);
  const avgSuccessionCoverage = Math.round((titles.reduce((sum, title) => sum + title.successionCoveragePct, 0) / titles.length) * 10) / 10;
  const avgAttritionRisk = Math.round((titles.reduce((sum, title) => sum + title.attritionRiskPct, 0) / titles.length) * 10) / 10;
  const avgMobility = Math.round((titles.reduce((sum, title) => sum + title.internalMobilityPct, 0) / titles.length) * 10) / 10;

  const mostPressuredTitle = [...titles].sort((a, b) => b.attritionRiskPct - a.attritionRiskPct)[0];
  const highestHiringTitle = [...titles].sort((a, b) => b.openPositions - a.openPositions)[0];
  const reviewTitle = [...titles].filter((title) => title.standardizationStatus === 'Needs Review').sort((a, b) => b.employeeCount - a.employeeCount)[0];

  const insights: StructureInsight[] = [
    {
      id: 'job-title-ins-1',
      severity: mostPressuredTitle && mostPressuredTitle.attritionRiskPct >= 14 ? 'high' : 'medium',
      title: `${mostPressuredTitle?.title || 'A title'} has the highest attrition pressure`,
      recommendation: 'Review role design, reward alignment, and workload distribution for this title family.',
    },
    {
      id: 'job-title-ins-2',
      severity: highestHiringTitle && highestHiringTitle.openPositions >= 4 ? 'medium' : 'low',
      title: `${highestHiringTitle?.title || 'A title'} carries the largest hiring demand`,
      recommendation: 'Prioritize talent pipeline planning and clarify standardized requirements for repeated openings.',
    },
    {
      id: 'job-title-ins-3',
      severity: reviewTitle ? 'high' : 'low',
      title: `${reviewTitle?.title || 'No title'} needs architecture review`,
      recommendation: 'Consolidate naming variants, clarify grade mapping, and align reporting scope with the target job architecture.',
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    permissions: {
      canEdit: true,
      canExport: true,
      canViewCosts: true,
    },
    summary: {
      totalTitles: titles.length,
      totalEmployees,
      totalOpenPositions,
      avgSuccessionCoverage,
      avgAttritionRisk,
      avgInternalMobility: avgMobility,
      titlesNeedingReview: titles.filter((title) => title.standardizationStatus === 'Needs Review').length,
      titleVariants: titles.filter((title) => title.standardizationStatus === 'Variant').length,
    },
    filterOptions: {
      families: Array.from(new Set(titles.map((title) => title.family))),
      levels: Array.from(new Set(titles.map((title) => title.level))),
      grades: Array.from(new Set(titles.map((title) => title.gradeCode))).sort((a, b) => a.localeCompare(b)),
      reportingLevels: Array.from(new Set(titles.map((title) => title.reportingLevel))),
      standardizationStatuses: ['Standard', 'Variant', 'Needs Review'] as Array<'Standard' | 'Variant' | 'Needs Review'>,
      healthStatuses: ['Healthy', 'Needs Attention', 'Critical'] as HealthStatus[],
    },
    titles,
    insights,
  };
};

export const getReportingHierarchyData = () => {
  const hierarchy: ReportingHierarchyRecord[] = [
    {
      id: 'rh-001',
      employeeId: 'DLE-EMP-90001',
      employeeName: 'Group Managing Director',
      jobTitle: 'Group Managing Director',
      department: 'Executive Office',
      businessUnit: 'Corporate',
      location: 'Lagos HQ',
      layer: 'Executive',
      managerId: null,
      managerName: null,
      managerTitle: null,
      directReports: 3,
      indirectReports: 18,
      totalReports: 21,
      spanOfControl: 8,
      successionCoveragePct: 82,
      attritionRiskPct: 5,
      openCriticalRoles: 1,
      approvalCoveragePct: 100,
      healthStatus: 'Healthy',
      actingCoverage: 'Covered',
      escalationPath: ['Board of Directors'],
      primaryTeams: ['Operations Division', 'Projects Division', 'Corporate Services Division'],
      responsibilityScope: 'Enterprise leadership, strategy execution, governance, and final escalation authority.',
    },
    {
      id: 'rh-002',
      employeeId: 'DLE-EMP-90002',
      employeeName: 'Executive Director, Operations',
      jobTitle: 'Executive Director, Operations',
      department: 'Operations Division',
      businessUnit: 'Operations',
      location: 'Port Harcourt',
      layer: 'Division',
      managerId: 'rh-001',
      managerName: 'Group Managing Director',
      managerTitle: 'Group Managing Director',
      directReports: 3,
      indirectReports: 9,
      totalReports: 12,
      spanOfControl: 6,
      successionCoveragePct: 79,
      attritionRiskPct: 9,
      openCriticalRoles: 2,
      approvalCoveragePct: 94,
      healthStatus: 'Healthy',
      actingCoverage: 'Covered',
      escalationPath: ['Group Managing Director', 'Board of Directors'],
      primaryTeams: ['Fabrication', 'Field Execution', 'Maintenance'],
      responsibilityScope: 'Owns operations delivery, regional yard execution, maintenance, and field-service performance.',
    },
    {
      id: 'rh-003',
      employeeId: 'DLE-EMP-90003',
      employeeName: 'Executive Director, Projects',
      jobTitle: 'Executive Director, Projects',
      department: 'Projects Division',
      businessUnit: 'Projects',
      location: 'Lagos HQ',
      layer: 'Division',
      managerId: 'rh-001',
      managerName: 'Group Managing Director',
      managerTitle: 'Group Managing Director',
      directReports: 3,
      indirectReports: 10,
      totalReports: 13,
      spanOfControl: 7,
      successionCoveragePct: 74,
      attritionRiskPct: 11,
      openCriticalRoles: 3,
      approvalCoveragePct: 91,
      healthStatus: 'Needs Attention',
      actingCoverage: 'At Risk',
      escalationPath: ['Group Managing Director', 'Board of Directors'],
      primaryTeams: ['Engineering', 'Project Controls', 'Site Delivery'],
      responsibilityScope: 'Leads project execution governance, engineering coordination, controls, and site-delivery assurance.',
    },
    {
      id: 'rh-004',
      employeeId: 'DLE-EMP-90004',
      employeeName: 'Executive Director, Corporate Services',
      jobTitle: 'Executive Director, Corporate Services',
      department: 'Corporate Services Division',
      businessUnit: 'Corporate Services',
      location: 'Lagos HQ',
      layer: 'Division',
      managerId: 'rh-001',
      managerName: 'Group Managing Director',
      managerTitle: 'Group Managing Director',
      directReports: 3,
      indirectReports: 7,
      totalReports: 10,
      spanOfControl: 5,
      successionCoveragePct: 81,
      attritionRiskPct: 7,
      openCriticalRoles: 1,
      approvalCoveragePct: 96,
      healthStatus: 'Healthy',
      actingCoverage: 'Covered',
      escalationPath: ['Group Managing Director', 'Board of Directors'],
      primaryTeams: ['Human Capital', 'Finance', 'Procurement'],
      responsibilityScope: 'Leads people, finance, procurement, and corporate governance shared services.',
    },
    {
      id: 'rh-005',
      employeeId: 'DLE-EMP-90005',
      employeeName: 'General Manager, Fabrication',
      jobTitle: 'General Manager, Fabrication',
      department: 'Fabrication',
      businessUnit: 'Operations',
      location: 'Warri Yard',
      layer: 'Department',
      managerId: 'rh-002',
      managerName: 'Executive Director, Operations',
      managerTitle: 'Executive Director, Operations',
      directReports: 2,
      indirectReports: 4,
      totalReports: 6,
      spanOfControl: 7,
      successionCoveragePct: 71,
      attritionRiskPct: 8,
      openCriticalRoles: 1,
      approvalCoveragePct: 92,
      healthStatus: 'Healthy',
      actingCoverage: 'Covered',
      escalationPath: ['Executive Director, Operations', 'Group Managing Director', 'Board of Directors'],
      primaryTeams: ['Fabrication Planning', 'Structural Fabrication'],
      responsibilityScope: 'Runs fabrication output, yard planning, production quality, and execution readiness.',
    },
    {
      id: 'rh-006',
      employeeId: 'DLE-EMP-90006',
      employeeName: 'General Manager, Field Execution',
      jobTitle: 'General Manager, Field Execution',
      department: 'Field Execution',
      businessUnit: 'Operations',
      location: 'Bonny Island',
      layer: 'Department',
      managerId: 'rh-002',
      managerName: 'Executive Director, Operations',
      managerTitle: 'Executive Director, Operations',
      directReports: 2,
      indirectReports: 5,
      totalReports: 7,
      spanOfControl: 8,
      successionCoveragePct: 65,
      attritionRiskPct: 13,
      openCriticalRoles: 2,
      approvalCoveragePct: 88,
      healthStatus: 'Needs Attention',
      actingCoverage: 'At Risk',
      escalationPath: ['Executive Director, Operations', 'Group Managing Director', 'Board of Directors'],
      primaryTeams: ['Site Supervision', 'Execution Support'],
      responsibilityScope: 'Owns field deployment, supervisor coverage, workfront controls, and safe site execution.',
    },
    {
      id: 'rh-007',
      employeeId: 'DLE-EMP-90007',
      employeeName: 'Head, Maintenance',
      jobTitle: 'Head, Maintenance',
      department: 'Maintenance',
      businessUnit: 'Operations',
      location: 'Port Harcourt',
      layer: 'Department',
      managerId: 'rh-002',
      managerName: 'Executive Director, Operations',
      managerTitle: 'Executive Director, Operations',
      directReports: 2,
      indirectReports: 3,
      totalReports: 5,
      spanOfControl: 6,
      successionCoveragePct: 73,
      attritionRiskPct: 9,
      openCriticalRoles: 1,
      approvalCoveragePct: 90,
      healthStatus: 'Healthy',
      actingCoverage: 'Covered',
      escalationPath: ['Executive Director, Operations', 'Group Managing Director', 'Board of Directors'],
      primaryTeams: ['Mechanical Maintenance', 'E&I Maintenance'],
      responsibilityScope: 'Leads maintenance reliability, shutdown readiness, and technical service continuity.',
    },
    {
      id: 'rh-008',
      employeeId: 'DLE-EMP-90008',
      employeeName: 'Head, Engineering',
      jobTitle: 'Head, Engineering',
      department: 'Engineering',
      businessUnit: 'Projects',
      location: 'Lagos HQ',
      layer: 'Department',
      managerId: 'rh-003',
      managerName: 'Executive Director, Projects',
      managerTitle: 'Executive Director, Projects',
      directReports: 2,
      indirectReports: 4,
      totalReports: 6,
      spanOfControl: 7,
      successionCoveragePct: 69,
      attritionRiskPct: 10,
      openCriticalRoles: 2,
      approvalCoveragePct: 89,
      healthStatus: 'Needs Attention',
      actingCoverage: 'At Risk',
      escalationPath: ['Executive Director, Projects', 'Group Managing Director', 'Board of Directors'],
      primaryTeams: ['Civil Engineering', 'Mechanical Engineering'],
      responsibilityScope: 'Owns engineering discipline delivery, assurance, and technical integration across projects.',
    },
    {
      id: 'rh-009',
      employeeId: 'DLE-EMP-90009',
      employeeName: 'Manager, Project Controls',
      jobTitle: 'Manager, Project Controls',
      department: 'Project Controls',
      businessUnit: 'Projects',
      location: 'Lagos HQ',
      layer: 'Department',
      managerId: 'rh-003',
      managerName: 'Executive Director, Projects',
      managerTitle: 'Executive Director, Projects',
      directReports: 2,
      indirectReports: 3,
      totalReports: 5,
      spanOfControl: 6,
      successionCoveragePct: 67,
      attritionRiskPct: 12,
      openCriticalRoles: 2,
      approvalCoveragePct: 86,
      healthStatus: 'Needs Attention',
      actingCoverage: 'Unassigned',
      escalationPath: ['Executive Director, Projects', 'Group Managing Director', 'Board of Directors'],
      primaryTeams: ['Planning', 'Cost Control'],
      responsibilityScope: 'Owns planning, cost control, performance reporting, and schedule governance.',
    },
    {
      id: 'rh-010',
      employeeId: 'DLE-EMP-90010',
      employeeName: 'Site Delivery Manager',
      jobTitle: 'Site Delivery Manager',
      department: 'Site Delivery',
      businessUnit: 'Projects',
      location: 'Bonny Island',
      layer: 'Department',
      managerId: 'rh-003',
      managerName: 'Executive Director, Projects',
      managerTitle: 'Executive Director, Projects',
      directReports: 2,
      indirectReports: 3,
      totalReports: 5,
      spanOfControl: 8,
      successionCoveragePct: 63,
      attritionRiskPct: 14,
      openCriticalRoles: 3,
      approvalCoveragePct: 84,
      healthStatus: 'Critical',
      actingCoverage: 'At Risk',
      escalationPath: ['Executive Director, Projects', 'Group Managing Director', 'Board of Directors'],
      primaryTeams: ['Site Coordination', 'Commissioning Support'],
      responsibilityScope: 'Leads site delivery execution, contractor control, and handover readiness.',
    },
    {
      id: 'rh-011',
      employeeId: 'DLE-EMP-90011',
      employeeName: 'Head, Human Capital',
      jobTitle: 'Head, Human Capital',
      department: 'Human Capital',
      businessUnit: 'Corporate Services',
      location: 'Lagos HQ',
      layer: 'Department',
      managerId: 'rh-004',
      managerName: 'Executive Director, Corporate Services',
      managerTitle: 'Executive Director, Corporate Services',
      directReports: 2,
      indirectReports: 3,
      totalReports: 5,
      spanOfControl: 5,
      successionCoveragePct: 72,
      attritionRiskPct: 8,
      openCriticalRoles: 1,
      approvalCoveragePct: 95,
      healthStatus: 'Healthy',
      actingCoverage: 'Covered',
      escalationPath: ['Executive Director, Corporate Services', 'Group Managing Director', 'Board of Directors'],
      primaryTeams: ['HR Operations', 'People Analytics'],
      responsibilityScope: 'Owns workforce planning, HR operations, talent governance, and employee-relations escalation.',
    },
    {
      id: 'rh-012',
      employeeId: 'DLE-EMP-90012',
      employeeName: 'Head, Finance',
      jobTitle: 'Head, Finance',
      department: 'Finance',
      businessUnit: 'Corporate Services',
      location: 'Lagos HQ',
      layer: 'Department',
      managerId: 'rh-004',
      managerName: 'Executive Director, Corporate Services',
      managerTitle: 'Executive Director, Corporate Services',
      directReports: 2,
      indirectReports: 3,
      totalReports: 5,
      spanOfControl: 5,
      successionCoveragePct: 77,
      attritionRiskPct: 7,
      openCriticalRoles: 1,
      approvalCoveragePct: 97,
      healthStatus: 'Healthy',
      actingCoverage: 'Covered',
      escalationPath: ['Executive Director, Corporate Services', 'Group Managing Director', 'Board of Directors'],
      primaryTeams: ['Financial Control', 'Treasury'],
      responsibilityScope: 'Owns financial governance, reporting control, treasury, and budget assurance.',
    },
  ];

  const totalEmployees = hierarchy.reduce((sum, row) => sum + row.totalReports + 1, 0);
  const totalOpenCriticalRoles = hierarchy.reduce((sum, row) => sum + row.openCriticalRoles, 0);
  const avgSuccessionCoverage = Math.round((hierarchy.reduce((sum, row) => sum + row.successionCoveragePct, 0) / hierarchy.length) * 10) / 10;
  const avgSpanOfControl = Math.round((hierarchy.reduce((sum, row) => sum + row.spanOfControl, 0) / hierarchy.length) * 10) / 10;

  const highestSpan = [...hierarchy].sort((a, b) => b.spanOfControl - a.spanOfControl)[0];
  const weakestCoverage = [...hierarchy].sort((a, b) => a.successionCoveragePct - b.successionCoveragePct)[0];
  const unassignedCoverage = hierarchy.filter((row) => row.actingCoverage === 'Unassigned');

  const insights: StructureInsight[] = [
    {
      id: 'rep-hier-ins-1',
      severity: highestSpan && highestSpan.spanOfControl >= 8 ? 'high' : 'medium',
      title: `${highestSpan?.employeeName || 'A manager'} is carrying the widest span of control`,
      recommendation: 'Review layer design, team supervisor coverage, and escalation load for this reporting line.',
    },
    {
      id: 'rep-hier-ins-2',
      severity: weakestCoverage && weakestCoverage.successionCoveragePct <= 65 ? 'high' : 'medium',
      title: `${weakestCoverage?.employeeName || 'A manager'} has the weakest succession coverage`,
      recommendation: 'Strengthen bench depth, interim coverage, and successor readiness for this leadership role.',
    },
    {
      id: 'rep-hier-ins-3',
      severity: unassignedCoverage.length ? 'high' : 'low',
      title: `${unassignedCoverage.length} reporting lane${unassignedCoverage.length === 1 ? '' : 's'} lack acting coverage`,
      recommendation: 'Assign fallback approvers and acting leads to reduce approval or escalation disruption.',
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    permissions: {
      canEdit: true,
      canExport: true,
      canViewCosts: true,
    },
    summary: {
      totalManagers: hierarchy.length,
      totalEmployees,
      totalOpenCriticalRoles,
      avgSuccessionCoverage,
      avgSpanOfControl,
      executiveLayers: hierarchy.filter((row) => row.layer === 'Executive').length,
      rolesAtRisk: hierarchy.filter((row) => row.healthStatus !== 'Healthy').length,
      uncoveredActingRoles: unassignedCoverage.length,
    },
    filterOptions: {
      layers: ['Executive', 'Division', 'Department', 'Team'] as Array<'Executive' | 'Division' | 'Department' | 'Team'>,
      businessUnits: Array.from(new Set(hierarchy.map((row) => row.businessUnit))).sort((a, b) => a.localeCompare(b)),
      locations: Array.from(new Set(hierarchy.map((row) => row.location))).sort((a, b) => a.localeCompare(b)),
      actingCoverage: ['Covered', 'At Risk', 'Unassigned'] as Array<'Covered' | 'At Risk' | 'Unassigned'>,
      healthStatuses: ['Healthy', 'Needs Attention', 'Critical'] as HealthStatus[],
    },
    hierarchy,
    insights,
  };
};

export const getPositionsData = () => {
  const positions: PositionRecord[] = [
    {
      id: 'pos-001',
      code: 'POS-OPS-001',
      title: 'Executive Director, Operations',
      department: 'Operations Division',
      businessUnit: 'Operations',
      location: 'Port Harcourt',
      gradeCode: 'G01',
      family: 'Executive',
      level: 'Strategic',
      reportingTo: 'Group Managing Director',
      positionType: 'Permanent',
      positionStatus: 'Filled',
      incumbentName: 'Executive Director, Operations',
      incumbentEmployeeId: 'DLE-EMP-90002',
      benchmarkSalaryUsd: 248000,
      fte: 1,
      criticality: 'Critical',
      successionCoveragePct: 79,
      attritionRiskPct: 9,
      approvalCoveragePct: 94,
      healthStatus: 'Healthy',
      replacementPriority: 'Planned',
      standardPosition: true,
      openDays: 0,
      jobTitleCode: 'JT-001',
      responsibilityScope: 'Owns operations strategy, field execution, and regional delivery performance.',
      requiredCapabilities: ['Enterprise leadership', 'Operational governance', 'Regional execution control'],
    },
    {
      id: 'pos-002',
      code: 'POS-OPS-014',
      title: 'General Manager, Fabrication',
      department: 'Fabrication',
      businessUnit: 'Operations',
      location: 'Warri Yard',
      gradeCode: 'G02',
      family: 'Management',
      level: 'Senior',
      reportingTo: 'Executive Director, Operations',
      positionType: 'Permanent',
      positionStatus: 'Filled',
      incumbentName: 'General Manager, Fabrication',
      incumbentEmployeeId: 'DLE-EMP-90005',
      benchmarkSalaryUsd: 142000,
      fte: 1,
      criticality: 'Critical',
      successionCoveragePct: 71,
      attritionRiskPct: 8,
      approvalCoveragePct: 92,
      healthStatus: 'Healthy',
      replacementPriority: 'Planned',
      standardPosition: true,
      openDays: 0,
      jobTitleCode: 'JT-002',
      responsibilityScope: 'Leads fabrication planning, yard operations, and production execution.',
      requiredCapabilities: ['Yard operations', 'Production control', 'Quality governance'],
    },
    {
      id: 'pos-003',
      code: 'POS-HR-001',
      title: 'Head, Human Capital',
      department: 'Human Capital',
      businessUnit: 'Corporate Services',
      location: 'Lagos HQ',
      gradeCode: 'G02',
      family: 'Management',
      level: 'Senior',
      reportingTo: 'Executive Director, Corporate Services',
      positionType: 'Permanent',
      positionStatus: 'Vacant',
      incumbentName: null,
      incumbentEmployeeId: null,
      benchmarkSalaryUsd: 136000,
      fte: 1,
      criticality: 'Critical',
      successionCoveragePct: 68,
      attritionRiskPct: 8,
      approvalCoveragePct: 95,
      healthStatus: 'Needs Attention',
      replacementPriority: 'Immediate',
      standardPosition: true,
      openDays: 41,
      jobTitleCode: 'JT-003',
      responsibilityScope: 'Owns workforce planning, HR operations, and enterprise people governance.',
      requiredCapabilities: ['Talent strategy', 'Employee relations', 'HR governance'],
    },
    {
      id: 'pos-004',
      code: 'POS-PRJ-011',
      title: 'Lead Project Engineer',
      department: 'Projects',
      businessUnit: 'Projects',
      location: 'Lagos HQ',
      gradeCode: 'G03',
      family: 'Management',
      level: 'Senior',
      reportingTo: 'Executive Director, Projects',
      positionType: 'Permanent',
      positionStatus: 'Filled',
      incumbentName: 'Lead Project Engineer',
      incumbentEmployeeId: 'DLE-EMP-93104',
      benchmarkSalaryUsd: 94500,
      fte: 1,
      criticality: 'Core',
      successionCoveragePct: 66,
      attritionRiskPct: 11,
      approvalCoveragePct: 89,
      healthStatus: 'Needs Attention',
      replacementPriority: 'Planned',
      standardPosition: true,
      openDays: 0,
      jobTitleCode: 'JT-004',
      responsibilityScope: 'Leads engineering workpacks and technical coordination for priority projects.',
      requiredCapabilities: ['Technical assurance', 'Multi-discipline coordination', 'Project delivery'],
    },
    {
      id: 'pos-005',
      code: 'POS-PC-007',
      title: 'Manager, Planning',
      department: 'Project Controls',
      businessUnit: 'Projects',
      location: 'Lagos HQ',
      gradeCode: 'G03',
      family: 'Management',
      level: 'Senior',
      reportingTo: 'Manager, Project Controls',
      positionType: 'Permanent',
      positionStatus: 'Under Review',
      incumbentName: 'Manager, Planning',
      incumbentEmployeeId: 'DLE-EMP-93105',
      benchmarkSalaryUsd: 90200,
      fte: 1,
      criticality: 'Core',
      successionCoveragePct: 64,
      attritionRiskPct: 10,
      approvalCoveragePct: 86,
      healthStatus: 'Needs Attention',
      replacementPriority: 'Monitor',
      standardPosition: false,
      openDays: 0,
      jobTitleCode: 'JT-005',
      responsibilityScope: 'Controls integrated planning, progress measurement, and schedule recovery.',
      requiredCapabilities: ['Integrated planning', 'Performance reporting', 'Recovery management'],
    },
    {
      id: 'pos-006',
      code: 'POS-ENG-023',
      title: 'Project Engineer',
      department: 'Engineering',
      businessUnit: 'Projects',
      location: 'Bonny Island',
      gradeCode: 'G04',
      family: 'Professional',
      level: 'Mid',
      reportingTo: 'Head, Engineering',
      positionType: 'Project',
      positionStatus: 'Filled',
      incumbentName: 'Project Engineer',
      incumbentEmployeeId: 'DLE-EMP-94201',
      benchmarkSalaryUsd: 48800,
      fte: 1,
      criticality: 'Core',
      successionCoveragePct: 73,
      attritionRiskPct: 10,
      approvalCoveragePct: 90,
      healthStatus: 'Healthy',
      replacementPriority: 'Planned',
      standardPosition: true,
      openDays: 0,
      jobTitleCode: 'JT-006',
      responsibilityScope: 'Delivers engineering packages and field technical coordination on active sites.',
      requiredCapabilities: ['Engineering execution', 'Site coordination', 'Technical documentation'],
    },
    {
      id: 'pos-007',
      code: 'POS-HR-018',
      title: 'HR Analyst',
      department: 'Human Capital',
      businessUnit: 'Corporate Services',
      location: 'Lagos HQ',
      gradeCode: 'G04',
      family: 'Professional',
      level: 'Mid',
      reportingTo: 'Head, Human Capital',
      positionType: 'Permanent',
      positionStatus: 'Filled',
      incumbentName: 'HR Analyst',
      incumbentEmployeeId: 'DLE-EMP-94211',
      benchmarkSalaryUsd: 45200,
      fte: 1,
      criticality: 'Core',
      successionCoveragePct: 75,
      attritionRiskPct: 8,
      approvalCoveragePct: 94,
      healthStatus: 'Healthy',
      replacementPriority: 'Monitor',
      standardPosition: true,
      openDays: 0,
      jobTitleCode: 'JT-007',
      responsibilityScope: 'Supports people analytics, workforce reporting, and HR data governance.',
      requiredCapabilities: ['People analytics', 'Data quality control', 'Workforce reporting'],
    },
    {
      id: 'pos-008',
      code: 'POS-FIN-012',
      title: 'Cost Controller',
      department: 'Finance',
      businessUnit: 'Corporate Services',
      location: 'Port Harcourt',
      gradeCode: 'G04',
      family: 'Professional',
      level: 'Mid',
      reportingTo: 'Head, Finance',
      positionType: 'Permanent',
      positionStatus: 'Vacant',
      incumbentName: null,
      incumbentEmployeeId: null,
      benchmarkSalaryUsd: 47600,
      fte: 1,
      criticality: 'Core',
      successionCoveragePct: 72,
      attritionRiskPct: 9,
      approvalCoveragePct: 90,
      healthStatus: 'Needs Attention',
      replacementPriority: 'Immediate',
      standardPosition: true,
      openDays: 28,
      jobTitleCode: 'JT-008',
      responsibilityScope: 'Tracks cost performance, commitments, forecasts, and control reporting.',
      requiredCapabilities: ['Cost control', 'Forecasting', 'Project financial reporting'],
    },
    {
      id: 'pos-009',
      code: 'POS-FLD-034',
      title: 'Site Supervisor',
      department: 'Field Execution',
      businessUnit: 'Operations',
      location: 'Bonny Island',
      gradeCode: 'G05',
      family: 'Technical',
      level: 'Mid',
      reportingTo: 'General Manager, Field Execution',
      positionType: 'Project',
      positionStatus: 'Vacant',
      incumbentName: null,
      incumbentEmployeeId: null,
      benchmarkSalaryUsd: 37200,
      fte: 1,
      criticality: 'Critical',
      successionCoveragePct: 61,
      attritionRiskPct: 14,
      approvalCoveragePct: 84,
      healthStatus: 'Critical',
      replacementPriority: 'Immediate',
      standardPosition: false,
      openDays: 54,
      jobTitleCode: 'JT-009',
      responsibilityScope: 'Supervises field crews, workfront progress, and site safety compliance.',
      requiredCapabilities: ['Crew supervision', 'Field HSE control', 'Execution reporting'],
    },
    {
      id: 'pos-010',
      code: 'POS-EI-029',
      title: 'Instrument Specialist',
      department: 'Electrical & Instrumentation',
      businessUnit: 'Operations',
      location: 'Warri Yard',
      gradeCode: 'G05',
      family: 'Technical',
      level: 'Mid',
      reportingTo: 'Head, Maintenance',
      positionType: 'Permanent',
      positionStatus: 'Filled',
      incumbentName: 'Instrument Specialist',
      incumbentEmployeeId: 'DLE-EMP-95234',
      benchmarkSalaryUsd: 38400,
      fte: 1,
      criticality: 'Core',
      successionCoveragePct: 62,
      attritionRiskPct: 13,
      approvalCoveragePct: 88,
      healthStatus: 'Needs Attention',
      replacementPriority: 'Planned',
      standardPosition: true,
      openDays: 0,
      jobTitleCode: 'JT-010',
      responsibilityScope: 'Maintains instrumentation integrity, testing readiness, and site troubleshooting support.',
      requiredCapabilities: ['Instrumentation maintenance', 'Commissioning support', 'Fault diagnosis'],
    },
    {
      id: 'pos-011',
      code: 'POS-PRJ-051',
      title: 'Project Coordinator',
      department: 'Projects',
      businessUnit: 'Projects',
      location: 'Port Harcourt',
      gradeCode: 'G06',
      family: 'Operations Support',
      level: 'Entry',
      reportingTo: 'Site Delivery Manager',
      positionType: 'Project',
      positionStatus: 'Filled',
      incumbentName: 'Project Coordinator',
      incumbentEmployeeId: 'DLE-EMP-96310',
      benchmarkSalaryUsd: 19100,
      fte: 1,
      criticality: 'Support',
      successionCoveragePct: 72,
      attritionRiskPct: 9,
      approvalCoveragePct: 89,
      healthStatus: 'Healthy',
      replacementPriority: 'Monitor',
      standardPosition: false,
      openDays: 0,
      jobTitleCode: 'JT-011',
      responsibilityScope: 'Coordinates reporting packs, logistics, and administrative support for execution teams.',
      requiredCapabilities: ['Coordination', 'Reporting support', 'Project administration'],
    },
    {
      id: 'pos-012',
      code: 'POS-ADM-017',
      title: 'Administrative Officer',
      department: 'Procurement',
      businessUnit: 'Corporate Services',
      location: 'Lagos HQ',
      gradeCode: 'G06',
      family: 'Operations Support',
      level: 'Entry',
      reportingTo: 'Head, Finance',
      positionType: 'Temporary',
      positionStatus: 'Frozen',
      incumbentName: null,
      incumbentEmployeeId: null,
      benchmarkSalaryUsd: 17600,
      fte: 1,
      criticality: 'Support',
      successionCoveragePct: 74,
      attritionRiskPct: 8,
      approvalCoveragePct: 91,
      healthStatus: 'Healthy',
      replacementPriority: 'Monitor',
      standardPosition: true,
      openDays: 73,
      jobTitleCode: 'JT-012',
      responsibilityScope: 'Supports records, workflow coordination, and routine administration across support functions.',
      requiredCapabilities: ['Records administration', 'Workflow support', 'Office coordination'],
    },
  ];

  const totalIncumbents = positions.filter((position) => position.incumbentEmployeeId).length;
  const totalVacant = positions.filter((position) => position.positionStatus === 'Vacant').length;
  const avgSuccessionCoverage = Math.round((positions.reduce((sum, position) => sum + position.successionCoveragePct, 0) / positions.length) * 10) / 10;
  const avgApprovalCoverage = Math.round((positions.reduce((sum, position) => sum + position.approvalCoveragePct, 0) / positions.length) * 10) / 10;

  const longestOpenPosition = [...positions].sort((a, b) => b.openDays - a.openDays)[0];
  const mostCriticalVacancy = [...positions].filter((position) => position.positionStatus === 'Vacant').sort((a, b) => b.openDays - a.openDays)[0];
  const reviewVariant = [...positions].filter((position) => !position.standardPosition).sort((a, b) => b.attritionRiskPct - a.attritionRiskPct)[0];

  const insights: StructureInsight[] = [
    {
      id: 'pos-ins-1',
      severity: longestOpenPosition && longestOpenPosition.openDays >= 45 ? 'high' : 'medium',
      title: `${longestOpenPosition?.title || 'A position'} has been open the longest`,
      recommendation: 'Escalate recruitment or redesign the position if the role remains difficult to fill.',
    },
    {
      id: 'pos-ins-2',
      severity: mostCriticalVacancy && mostCriticalVacancy.criticality === 'Critical' ? 'high' : 'medium',
      title: `${mostCriticalVacancy?.title || 'A role'} is the highest-priority vacancy`,
      recommendation: 'Prioritize immediate replacement planning and assign interim coverage until the position is filled.',
    },
    {
      id: 'pos-ins-3',
      severity: reviewVariant ? 'medium' : 'low',
      title: `${reviewVariant?.title || 'A position'} deviates from the standard architecture`,
      recommendation: 'Review title, grade, and position design alignment to reduce structural drift.',
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    permissions: {
      canEdit: true,
      canExport: true,
      canViewCosts: true,
    },
    summary: {
      totalPositions: positions.length,
      totalIncumbents,
      totalVacant,
      avgSuccessionCoverage,
      avgApprovalCoverage,
      criticalPositions: positions.filter((position) => position.criticality === 'Critical').length,
      nonStandardPositions: positions.filter((position) => !position.standardPosition).length,
    },
    filterOptions: {
      businessUnits: Array.from(new Set(positions.map((position) => position.businessUnit))).sort((a, b) => a.localeCompare(b)),
      grades: Array.from(new Set(positions.map((position) => position.gradeCode))).sort((a, b) => a.localeCompare(b)),
      positionTypes: ['Permanent', 'Contract', 'Project', 'Temporary'] as Array<'Permanent' | 'Contract' | 'Project' | 'Temporary'>,
      positionStatuses: ['Filled', 'Vacant', 'Frozen', 'Under Review'] as Array<'Filled' | 'Vacant' | 'Frozen' | 'Under Review'>,
      criticalities: ['Critical', 'Core', 'Support'] as Array<'Critical' | 'Core' | 'Support'>,
      healthStatuses: ['Healthy', 'Needs Attention', 'Critical'] as HealthStatus[],
    },
    positions,
    insights,
  };
};

export const getOrganogramData = () => {
  const nodes = buildEnhancedNodes(organizationNodes);
  const nodeMap = buildNodeMap(organizationNodes);
  const childrenByParent = buildChildrenMap(organizationNodes);
  const enhancedMap = new Map(nodes.map((node) => [node.id, node]));

  const getDepth = (node: OrgNode) => {
    let depth = 0;
    let current = node.parentId ? nodeMap.get(node.parentId) || null : null;
    while (current) {
      depth += 1;
      current = current.parentId ? nodeMap.get(current.parentId) || null : null;
    }
    return depth;
  };

  const getParentChain = (parentId: string | null) => {
    const chain: string[] = [];
    let current = parentId ? nodeMap.get(parentId) || null : null;
    while (current) {
      chain.unshift(current.name);
      current = current.parentId ? nodeMap.get(current.parentId) || null : null;
    }
    return chain;
  };

  const getDescendants = (id: string): EnhancedOrgNode[] => {
    const children = childrenByParent[id] || [];
    return children.flatMap((child) => {
      const enhanced = enhancedMap.get(child.id);
      return enhanced ? [enhanced, ...getDescendants(child.id)] : getDescendants(child.id);
    });
  };

  const leaderTitleByKind: Record<NodeKind, string> = {
    Company: 'Group Managing Director',
    Division: 'Executive Director',
    'Business Unit': 'General Manager',
    Department: 'Head of Department',
    Team: 'Team Lead',
  };

  const managerialScopeByKind: Record<NodeKind, OrganogramNodeRecord['managerialScope']> = {
    Company: 'Enterprise',
    Division: 'Strategic',
    'Business Unit': 'Operational',
    Department: 'Operational',
    Team: 'Delivery',
  };

  const records: OrganogramNodeRecord[] = nodes.map((node) => {
    const descendants = getDescendants(node.id);
    const parent = node.parentId ? nodeMap.get(node.parentId) || null : null;

    return {
      ...node,
      depth: getDepth(node),
      parentName: parent?.name || null,
      parentKind: parent?.kind || null,
      parentChain: getParentChain(node.parentId),
      branchHeadcount: node.headcount + descendants.reduce((sum, item) => sum + item.headcount, 0),
      branchOpenRoles: node.openRoles + descendants.reduce((sum, item) => sum + item.openRoles, 0),
      branchCriticalUnits: [node, ...descendants].filter((item) => item.healthStatus === 'Critical').length,
      branchAttentionUnits: [node, ...descendants].filter((item) => item.healthStatus === 'Needs Attention').length,
      directChildNames: (childrenByParent[node.id] || []).map((child) => child.name),
      leaderTitle: leaderTitleByKind[node.kind],
      managerialScope: managerialScopeByKind[node.kind],
    };
  });

  const totalHeadcount = records.reduce((sum, node) => sum + node.headcount, 0);
  const totalOpenRoles = records.reduce((sum, node) => sum + node.openRoles, 0);
  const avgSpanOfControl = Math.round((records.reduce((sum, node) => sum + node.spanOfControl, 0) / records.length) * 10) / 10;
  const maxDepth = Math.max(...records.map((node) => node.depth));
  const branchRiskNodes = records.filter((node) => node.branchCriticalUnits > 0 || node.branchAttentionUnits >= 2);

  const deepestNode = [...records].sort((a, b) => b.depth - a.depth)[0];
  const widestBranch = [...records].sort((a, b) => b.branchHeadcount - a.branchHeadcount)[0];
  const weakestBranch = [...records].sort((a, b) => a.successionCoveragePct - b.successionCoveragePct)[0];

  const insights: StructureInsight[] = [
    {
      id: 'orggram-ins-1',
      severity: deepestNode && deepestNode.depth >= 4 ? 'medium' : 'low',
      title: `${deepestNode?.name || 'The hierarchy'} sits at the deepest reporting layer`,
      recommendation: 'Review whether the deepest branch still supports clear escalation and manageable managerial span.',
    },
    {
      id: 'orggram-ins-2',
      severity: widestBranch && widestBranch.branchHeadcount >= 300 ? 'high' : 'medium',
      title: `${widestBranch?.name || 'A branch'} carries the largest workforce footprint`,
      recommendation: 'Use this branch as a focal point for org design governance, vacancy planning, and control capacity.',
    },
    {
      id: 'orggram-ins-3',
      severity: weakestBranch && weakestBranch.successionCoveragePct <= 70 ? 'high' : 'medium',
      title: `${weakestBranch?.name || 'A branch'} has the weakest succession coverage in the chart`,
      recommendation: 'Strengthen successor readiness and leadership continuity in this branch of the organogram.',
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    permissions: {
      canEdit: true,
      canExport: true,
      canViewCosts: true,
    },
    summary: {
      totalNodes: records.length,
      totalHeadcount,
      totalOpenRoles,
      avgSpanOfControl,
      maxDepth,
      rootLeaders: records.filter((node) => node.depth <= 1).length,
      branchesAtRisk: branchRiskNodes.length,
    },
    filterOptions: {
      kinds: Array.from(new Set(records.map((node) => node.kind))),
      locations: Array.from(new Set(records.map((node) => node.location))).sort((a, b) => a.localeCompare(b)),
      depths: Array.from(new Set(records.map((node) => node.depth))).sort((a, b) => a - b),
      healthStatuses: ['Healthy', 'Needs Attention', 'Critical'] as HealthStatus[],
    },
    nodes: records,
    insights,
  };
};
