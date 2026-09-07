export const permissions = {
  view:'view_projects_engineering', create:'create_project', edit:'edit_project', approve:'approve_project',
  engineering:'manage_engineering', planning:'manage_project_planning', cost:'view_project_costs', procurement:'manage_project_procurement',
  quality:'manage_project_quality', hse:'manage_project_hse', risk:'manage_project_risks', ai:'use_project_ai'
} as const;

export const roleMatrix:Record<string,string[]> = {
  'Super Administrator':['*'],
  'MD/CEO':['view_projects_engineering','approve_project','view_project_costs','use_project_ai'],
  'CFO':['view_projects_engineering','view_project_costs','approve_project','use_project_ai'],
  'GM Operations':['view_projects_engineering','approve_project','manage_project_planning','manage_project_risks','use_project_ai'],
  'Project Manager':['view_projects_engineering','create_project','edit_project','manage_engineering','manage_project_planning','manage_project_procurement','manage_project_quality','manage_project_hse','manage_project_risks','use_project_ai'],
  'Engineering Manager':['view_projects_engineering','manage_engineering','manage_project_planning','manage_project_risks'],
  'Cost Controller':['view_projects_engineering','view_project_costs','manage_project_planning'],
  'Document Controller':['view_projects_engineering','manage_engineering'],
  'HSE Officer':['view_projects_engineering','manage_project_hse'],
  'Quality Engineer':['view_projects_engineering','manage_project_quality']
};
export function can(role:string, permission:string){ const p=roleMatrix[role]||[]; return p.includes('*')||p.includes(permission); }
