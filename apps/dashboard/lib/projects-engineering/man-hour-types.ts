export type UtilizationGate = 'all' | 'pmApproved' | 'costValidated' | 'payrollReady';

export type ManHourRegisterRow = {
  workDate: string;
  headerId: string;
  lineId: string;
  employeeId: string;
  employeeNo: string;
  employeeName: string;
  projectCode: string;
  projectName: string;
  taskName: string;
  hours: number;
  headerStatus: string;
  gate: UtilizationGate;
};

export type ManHourEmployeeSummary = {
  employeeId: string;
  employeeNo: string;
  employeeName: string;
  hours: number;
  days: number;
};

export type ManHourWeekBucket = {
  weekEnding: string;
  hours: number;
  employees: number;
};

export type ProjectManHourUtilization = {
  projectCode: string;
  projectName: string;
  generatedAt: string;
  gate: UtilizationGate;
  summary: {
    totalHours: number;
    productiveHours: number;
    idleHours: number;
    employeeCount: number;
    dayCount: number;
    averageHoursPerEmployee: number;
    pmApprovedHours: number;
    costValidatedHours: number;
    payrollReadyHours: number;
    budgetedHours: number;
    remainingHours: number;
    consumedPct: number;
    utilizationPct: number;
    etcHours: number;
    eacHours: number;
  };
  byEmployee: ManHourEmployeeSummary[];
  byWeek: ManHourWeekBucket[];
  register: ManHourRegisterRow[];
  labourQueue: Array<{
    lineId: string;
    workDate: string;
    employeeName: string;
    employeeNo: string;
    hours: number;
    taskName: string;
    headerStatus: string;
    costValidationStatus: 'Pending' | 'Approved' | 'Returned' | 'Blocked';
  }>;
};

/** Lightweight portfolio row for dashboards (client-safe). */
export type PortfolioManHourSummary = {
  projectCode: string;
  productiveHours: number;
  totalHours: number;
  idleHours: number;
  employeeCount: number;
  dayCount: number;
  pmApprovedHours: number;
  budgetedHours: number;
  utilizationPct: number;
  consumedPct: number;
};
