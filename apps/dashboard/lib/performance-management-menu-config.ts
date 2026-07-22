import {
  Activity,
  AlertTriangle,
  ArrowUpCircle,
  Award,
  BadgeCheck,
  BarChart3,
  BookOpen,
  Bot,
  Brain,
  Briefcase,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  FileBarChart,
  Gauge,
  Gift,
  GitBranch,
  GraduationCap,
  LayoutDashboard,
  LineChart,
  MessageCircle,
  MessagesSquare,
  RotateCw,
  Scale,
  Settings,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  Trophy,
  User,
  UserCheck,
  Users,
} from 'lucide-react';
import type { PerformanceMenuItem, PerformanceRole } from './performance-management-types';

const ALL_HR: PerformanceRole[] = ['HR Officer', 'HR Manager', 'Super Administrator'];
const MANAGEMENT: PerformanceRole[] = ['Supervisor', 'Project Manager', 'HR Officer', 'HR Manager', 'Super Administrator'];
const EMPLOYEE: PerformanceRole[] = ['Employee', 'Supervisor', 'Project Manager', 'HR Officer', 'HR Manager', 'Executive Management', 'Super Administrator'];
/** For now all HR department staff can open executive / analytics surfaces. */
const EXEC_READ: PerformanceRole[] = ['Executive Management', 'HR Officer', 'HR Manager', 'Super Administrator'];
const ADMIN_HR: PerformanceRole[] = ['HR Officer', 'HR Manager', 'Super Administrator'];

export const PERFORMANCE_MODULE_BASE = '/hris/performance-management';

export const performanceMenuTree: PerformanceMenuItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    route: 'dashboard',
    icon: LayoutDashboard,
    roles: EMPLOYEE,
    keywords: ['home', 'overview', 'summary'],
  },
  {
    id: 'planning',
    label: 'Planning',
    route: 'planning',
    icon: ClipboardList,
    roles: EMPLOYEE,
    children: [
      { id: 'performance-cycles', label: 'Performance Cycles', route: 'planning/performance-cycles', icon: CalendarClock, roles: MANAGEMENT, badgeKey: 'performance-cycles', keywords: ['appraisal', 'cycle', 'period'] },
      { id: 'corporate-goals', label: 'Company Objectives', route: 'planning/corporate-goals', icon: Target, roles: ALL_HR, keywords: ['strategic', 'company', 'objectives'] },
      { id: 'department-goals', label: 'Goal Cascading', route: 'planning/department-goals', icon: Target, roles: MANAGEMENT, keywords: ['team goals', 'dept', 'cascade'] },
      { id: 'employee-goals', label: 'OKR & KPI Management', route: 'planning/employee-goals', icon: Target, roles: EMPLOYEE, keywords: ['goals', 'objectives', 'targets', 'okr', 'kpi'] },
      { id: 'goal-library', label: 'Goal Library', route: 'planning/goal-library', icon: BookOpen, roles: ALL_HR, keywords: ['templates', 'library'] },
      { id: 'kpi-setup', label: 'KPI Setup', route: 'planning/kpi-setup', icon: Gauge, roles: ALL_HR, keywords: ['kpi', 'metrics', 'indicators'] },
      { id: 'mid-year-reviews', label: 'Mid-Year Reviews', route: 'planning/mid-year-reviews', icon: CalendarDays, roles: EMPLOYEE, keywords: ['mid-year', 'interim'] },
    ],
  },
  {
    id: 'competencies',
    label: 'Competencies',
    route: 'competencies',
    icon: Brain,
    roles: [...MANAGEMENT, ...ALL_HR],
    children: [
      { id: 'competency-framework', label: 'Competency Framework', route: 'competencies/competency-framework', icon: Brain, roles: ALL_HR, keywords: ['competency', 'skills'] },
      { id: 'behaviour-framework', label: 'Behaviour Framework', route: 'competencies/behaviour-framework', icon: UserCheck, roles: ALL_HR, keywords: ['behaviour', 'behavior'] },
      { id: 'rating-scales', label: 'Rating Scales', route: 'competencies/rating-scales', icon: Star, roles: ALL_HR, keywords: ['rating', 'scale'] },
    ],
  },
  {
    id: 'performance-reviews',
    label: 'Performance Reviews',
    route: 'performance-reviews',
    icon: ClipboardCheck,
    roles: EMPLOYEE,
    children: [
      { id: 'self-appraisal', label: 'Self Appraisal', route: 'performance-reviews/self-appraisal', icon: User, roles: EMPLOYEE, badgeKey: 'self-appraisal', keywords: ['self', 'appraisal', 'review'] },
      { id: 'supervisor-review', label: 'Manager Assessments', route: 'performance-reviews/supervisor-review', icon: Users, roles: ['Supervisor', 'Project Manager', ...ALL_HR], badgeKey: 'supervisor-review', keywords: ['supervisor', 'manager review'] },
      { id: 'project-manager-review', label: 'Matrix / Project Inputs', route: 'performance-reviews/project-manager-review', icon: Briefcase, roles: ['Project Manager', ...ALL_HR], badgeKey: 'project-manager-review', keywords: ['project', 'pm review', 'matrix'] },
      { id: '360-review', label: '360° Appraisals', route: 'performance-reviews/360-review', icon: RotateCw, roles: [...MANAGEMENT, ...ALL_HR], keywords: ['360', 'feedback'] },
      { id: 'calibration', label: 'Calibration', route: 'performance-reviews/calibration', icon: Scale, roles: ALL_HR, keywords: ['calibration', 'moderation'] },
      { id: 'final-evaluation', label: 'Results Approval', route: 'performance-reviews/final-evaluation', icon: BadgeCheck, roles: ALL_HR, keywords: ['final', 'evaluation', 'results'] },
      { id: 'performance-scorecard', label: 'Published Results', route: 'performance-reviews/performance-scorecard', icon: BarChart3, roles: [...MANAGEMENT, ...ALL_HR, 'Employee'], keywords: ['scorecard', 'score', 'results'] },
      { id: 'appeals', label: 'Appeals & Grievances', route: 'performance-reviews/appeals', icon: AlertTriangle, roles: EMPLOYEE, keywords: ['appeal', 'grievance'] },
      { id: 'probation', label: 'Probation & Confirmation', route: 'performance-reviews/probation', icon: UserCheck, roles: MANAGEMENT, keywords: ['probation', 'confirmation'] },
    ],
  },
  {
    id: 'continuous-performance',
    label: 'Continuous Performance',
    route: 'continuous-performance',
    icon: Activity,
    roles: EMPLOYEE,
    children: [
      { id: 'monthly-check-ins', label: 'Continuous Check-ins', route: 'continuous-performance/monthly-check-ins', icon: CalendarDays, roles: EMPLOYEE, keywords: ['check-in', 'checkin', 'monthly', 'continuous'] },
      { id: 'coaching-sessions', label: 'Coaching Sessions', route: 'continuous-performance/coaching-sessions', icon: MessagesSquare, roles: MANAGEMENT, keywords: ['coaching', 'sessions'] },
      { id: 'continuous-feedback', label: 'Continuous Feedback', route: 'continuous-performance/continuous-feedback', icon: MessageCircle, roles: EMPLOYEE, keywords: ['feedback'] },
      { id: 'development-conversations', label: 'Development Conversations', route: 'continuous-performance/development-conversations', icon: MessagesSquare, roles: MANAGEMENT, keywords: ['development', 'conversation'] },
    ],
  },
  {
    id: 'improvement',
    label: 'Improvement',
    route: 'improvement',
    icon: TrendingUp,
    roles: [...MANAGEMENT, ...ALL_HR],
    children: [
      { id: 'pip', label: 'Performance Improvement Plan (PIP)', route: 'improvement/pip', icon: AlertTriangle, roles: MANAGEMENT, badgeKey: 'pip', keywords: ['pip', 'improvement plan'] },
      { id: 'development-plans', label: 'Development Plans', route: 'improvement/development-plans', icon: BookOpen, roles: EMPLOYEE, keywords: ['development', 'idp'] },
      { id: 'training-recommendations', label: 'Training Recommendations', route: 'improvement/training-recommendations', icon: GraduationCap, roles: [...MANAGEMENT, ...ALL_HR], badgeKey: 'training-recommendations', keywords: ['training', 'learning'] },
    ],
  },
  {
    id: 'talent-management',
    label: 'Talent Management',
    route: 'talent-management',
    icon: Sparkles,
    roles: [...MANAGEMENT, ...ALL_HR, 'Executive Management'],
    children: [
      { id: 'promotion-recommendations', label: 'Promotion Recommendations', route: 'talent-management/promotion-recommendations', icon: ArrowUpCircle, roles: MANAGEMENT, badgeKey: 'promotion-recommendations', keywords: ['promotion'] },
      { id: 'succession-planning', label: 'Succession Planning', route: 'talent-management/succession-planning', icon: GitBranch, roles: ALL_HR, keywords: ['succession'] },
      { id: 'high-potential', label: 'High Potential Employees', route: 'talent-management/high-potential', icon: Award, roles: ALL_HR, keywords: ['hipo', 'high potential'] },
      { id: 'talent-review', label: 'Talent Review (9-Box)', route: 'talent-management/talent-review', icon: BarChart3, roles: ALL_HR, keywords: ['9-box', 'talent review', 'calibration'] },
      { id: 'career-development', label: 'Career Development', route: 'talent-management/career-development', icon: GraduationCap, roles: EMPLOYEE, keywords: ['career'] },
    ],
  },
  {
    id: 'recognition-rewards',
    label: 'Recognition & Rewards',
    route: 'recognition-rewards',
    icon: Trophy,
    roles: EMPLOYEE,
    children: [
      { id: 'employee-recognition', label: 'Employee Recognition', route: 'recognition-rewards/employee-recognition', icon: Trophy, roles: EMPLOYEE, keywords: ['recognition', 'praise'] },
      { id: 'rewards', label: 'Rewards', route: 'recognition-rewards/rewards', icon: Gift, roles: [...MANAGEMENT, ...ALL_HR], keywords: ['rewards', 'incentives'] },
      { id: 'achievement-history', label: 'Achievement History', route: 'recognition-rewards/achievement-history', icon: Award, roles: EMPLOYEE, keywords: ['achievements', 'history'] },
      { id: 'awards', label: 'Awards', route: 'recognition-rewards/awards', icon: Trophy, roles: ALL_HR, keywords: ['awards'] },
    ],
  },
  {
    id: 'reports-analytics',
    label: 'Reports & Analytics',
    route: 'reports-analytics',
    icon: FileBarChart,
    roles: [...MANAGEMENT, ...ALL_HR, 'Executive Management'],
    children: [
      { id: 'executive-dashboard', label: 'Executive Dashboard', route: 'reports-analytics/executive-dashboard', icon: LayoutDashboard, roles: EXEC_READ, keywords: ['executive', 'dashboard'] },
      { id: 'performance-reports', label: 'Performance Reports', route: 'reports-analytics/performance-reports', icon: FileBarChart, roles: [...MANAGEMENT, ...ALL_HR], keywords: ['reports'] },
      { id: 'kpi-reports', label: 'KPI Reports', route: 'reports-analytics/kpi-reports', icon: Gauge, roles: ALL_HR, keywords: ['kpi reports'] },
      { id: 'department-analytics', label: 'Department Analytics', route: 'reports-analytics/department-analytics', icon: BarChart3, roles: EXEC_READ, keywords: ['department', 'analytics'] },
      { id: 'goal-achievement-reports', label: 'Goal Achievement Reports', route: 'reports-analytics/goal-achievement-reports', icon: Target, roles: ALL_HR, keywords: ['goals', 'achievement'] },
      { id: 'competency-gap-reports', label: 'Competency Gap Reports', route: 'reports-analytics/competency-gap-reports', icon: Brain, roles: ALL_HR, keywords: ['competency gap'] },
      { id: 'trend-analysis', label: 'Trend Analysis', route: 'reports-analytics/trend-analysis', icon: LineChart, roles: ALL_HR, keywords: ['trends', 'analysis'] },
      { id: 'export-centre', label: 'Export Centre', route: 'reports-analytics/export-centre', icon: FileBarChart, roles: ALL_HR, keywords: ['export', 'download'] },
    ],
  },
  {
    id: 'ai-intelligence',
    label: 'AI Performance Intelligence',
    route: 'ai-intelligence',
    icon: Bot,
    roles: [...ALL_HR, 'Executive Management'],
    children: [
      { id: 'ai-insights', label: 'AI Insights', route: 'ai-intelligence/ai-insights', icon: Bot, roles: EXEC_READ, keywords: ['ai', 'insights'] },
      { id: 'performance-prediction', label: 'Performance Prediction', route: 'ai-intelligence/performance-prediction', icon: LineChart, roles: ALL_HR, keywords: ['prediction', 'forecast'] },
      { id: 'promotion-readiness', label: 'Promotion Readiness', route: 'ai-intelligence/promotion-readiness', icon: ArrowUpCircle, roles: ALL_HR, keywords: ['promotion readiness'] },
      { id: 'competency-gap-analysis', label: 'Competency Gap Analysis', route: 'ai-intelligence/competency-gap-analysis', icon: Brain, roles: ALL_HR, keywords: ['gap analysis'] },
      { id: 'talent-risk-analysis', label: 'Talent Risk Analysis', route: 'ai-intelligence/talent-risk-analysis', icon: AlertTriangle, roles: ALL_HR, keywords: ['risk', 'attrition'] },
      { id: 'ai-recommendations', label: 'AI Recommendations', route: 'ai-intelligence/ai-recommendations', icon: Sparkles, roles: ALL_HR, keywords: ['recommendations'] },
    ],
  },
  {
    id: 'administration',
    label: 'Administration',
    route: 'administration',
    icon: Settings,
    roles: ADMIN_HR,
    children: [
      { id: 'performance-settings', label: 'Performance Settings', route: 'administration/performance-settings', icon: Settings, roles: ADMIN_HR, keywords: ['settings'] },
      { id: 'approval-workflow', label: 'Approval Workflow', route: 'administration/approval-workflow', icon: GitBranch, roles: ADMIN_HR, keywords: ['workflow', 'approval'] },
      { id: 'rating-configuration', label: 'Rating Configuration', route: 'administration/rating-configuration', icon: Star, roles: ADMIN_HR, keywords: ['rating'] },
      { id: 'notification-rules', label: 'Notification Rules', route: 'administration/notification-rules', icon: MessageCircle, roles: ADMIN_HR, badgeKey: 'notifications', keywords: ['notifications'] },
      { id: 'templates', label: 'Templates', route: 'administration/templates', icon: ClipboardList, roles: ADMIN_HR, keywords: ['templates'] },
      { id: 'audit-logs', label: 'Audit Logs', route: 'administration/audit-logs', icon: FileBarChart, roles: ADMIN_HR, keywords: ['audit'] },
      { id: 'role-permissions', label: 'Role Permissions', route: 'administration/role-permissions', icon: Users, roles: ADMIN_HR, keywords: ['permissions', 'roles'] },
    ],
  },
];

export const performanceRouteHref = (route: string) =>
  `${PERFORMANCE_MODULE_BASE}/${route.replace(/^\/+/, '')}`;

export const flattenPerformanceMenu = (items: PerformanceMenuItem[] = performanceMenuTree): PerformanceMenuItem[] =>
  items.flatMap((item) => [item, ...(item.children ? flattenPerformanceMenu(item.children) : [])]);

export const performanceRouteAliases: Record<string, string> = {
  'performance-dashboard': 'dashboard',
  dashboard: 'dashboard',
  'appraisal-cycles': 'planning/performance-cycles',
  'performance-cycles': 'planning/performance-cycles',
  'kpi-setup': 'planning/kpi-setup',
  'employee-goals': 'planning/employee-goals',
  'department-goals': 'planning/department-goals',
  'self-appraisal': 'performance-reviews/self-appraisal',
  'supervisor-review': 'performance-reviews/supervisor-review',
  '360-degree-review': 'performance-reviews/360-review',
  'competency-assessment': 'competencies/competency-framework',
  'performance-scorecard': 'performance-reviews/performance-scorecard',
  'promotion-recommendation': 'talent-management/promotion-recommendations',
  'performance-improvement-plan': 'improvement/pip',
  'performance-reports': 'reports-analytics/performance-reports',
  'ai-insights': 'ai-intelligence/ai-insights',
  'performance-settings': 'administration/performance-settings',
};

export const resolvePerformanceRoute = (route: string) => {
  const normalized = route.replace(/^\/+/, '').replace(/^hris\/performance-management\/?/, '');
  return performanceRouteAliases[normalized] || normalized;
};

export const findPerformanceMenuItem = (route: string): PerformanceMenuItem | null => {
  const normalized = resolvePerformanceRoute(route);
  for (const item of flattenPerformanceMenu()) {
    if (item.route === normalized || item.id === normalized) return item;
  }
  return null;
};

export const findParentGroupId = (route: string): string | null => {
  const normalized = resolvePerformanceRoute(route);
  for (const parent of performanceMenuTree) {
    if (parent.route === normalized) return parent.id;
    if (parent.children?.some((child) => child.route === normalized)) return parent.id;
  }
  return null;
};

export const roleCanSeeMenuItem = (role: PerformanceRole, item: PerformanceMenuItem, permissions: string[] = []) => {
  if (permissions.includes('*')) return true;
  if (item.permissions?.length && !item.permissions.some((p) => permissions.includes(p) || permissions.includes(`${p.split('.')[0]}.*`))) {
    if (role !== 'Super Administrator') return false;
  }
  if (!item.roles?.length) return true;
  return item.roles.includes(role);
};

export const filterMenuByRole = (
  items: PerformanceMenuItem[],
  role: PerformanceRole,
  permissions: string[] = [],
  featureFlags: Record<string, boolean> = {},
): PerformanceMenuItem[] =>
  items.reduce<PerformanceMenuItem[]>((acc, item) => {
    const children = item.children ? filterMenuByRole(item.children, role, permissions, featureFlags) : undefined;
    const selfVisible =
      (!item.featureFlag || featureFlags[item.featureFlag] !== false) &&
      roleCanSeeMenuItem(role, item, permissions);
    const childVisible = Boolean(children?.length);
    if (!selfVisible && !childVisible) return acc;
    acc.push(children ? { ...item, children } : { ...item, children: undefined });
    return acc;
  }, []);

export const defaultPerformanceRoles: PerformanceRole[] = [
  'Employee',
  'Supervisor',
  'Project Manager',
  'HR Officer',
  'HR Manager',
  'Executive Management',
  'Super Administrator',
];

export const resolvePerformanceRole = (input?: string | null): PerformanceRole => {
  const value = String(input || '').trim();
  const match = defaultPerformanceRoles.find((role) => role.toLowerCase() === value.toLowerCase());
  return match || 'HR Officer';
};
