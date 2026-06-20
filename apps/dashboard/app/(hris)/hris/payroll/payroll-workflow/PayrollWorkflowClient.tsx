'use client';

import {
  ArrowRight,
  Banknote,
  Bell,
  Building2,
  Calculator,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  FileLock2,
  FileText,
  GitBranch,
  Landmark,
  LockKeyhole,
  Mail,
  ReceiptText,
  ShieldCheck,
  UserRound,
  UsersRound,
  WalletCards,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

type StageTone = 'blue' | 'green' | 'purple' | 'navy' | 'teal' | 'orange' | 'slate';

type StageItem = {
  icon: LucideIcon;
  title: string;
  detail?: string;
};

type ApprovalStep = {
  title: string;
  icon: LucideIcon;
  tone: StageTone;
  actions: string[];
  status: string;
};

const toneStyles: Record<StageTone, { header: string; soft: string; border: string; text: string; icon: string; badge: string; line: string }> = {
  blue: {
    header: 'bg-blue-700 text-white',
    soft: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-800',
    icon: 'bg-blue-100 text-blue-700',
    badge: 'border-blue-300 bg-blue-50 text-blue-800',
    line: 'bg-blue-600',
  },
  green: {
    header: 'bg-emerald-700 text-white',
    soft: 'bg-emerald-50',
    border: 'border-emerald-200',
    text: 'text-emerald-800',
    icon: 'bg-emerald-100 text-emerald-700',
    badge: 'border-emerald-300 bg-emerald-50 text-emerald-800',
    line: 'bg-emerald-600',
  },
  purple: {
    header: 'bg-violet-700 text-white',
    soft: 'bg-violet-50',
    border: 'border-violet-200',
    text: 'text-violet-800',
    icon: 'bg-violet-100 text-violet-700',
    badge: 'border-violet-300 bg-violet-50 text-violet-800',
    line: 'bg-violet-600',
  },
  navy: {
    header: 'bg-slate-900 text-white',
    soft: 'bg-slate-50',
    border: 'border-slate-300',
    text: 'text-slate-900',
    icon: 'bg-slate-100 text-slate-800',
    badge: 'border-slate-300 bg-slate-50 text-slate-900',
    line: 'bg-slate-900',
  },
  teal: {
    header: 'bg-teal-700 text-white',
    soft: 'bg-teal-50',
    border: 'border-teal-200',
    text: 'text-teal-800',
    icon: 'bg-teal-100 text-teal-700',
    badge: 'border-teal-300 bg-teal-50 text-teal-800',
    line: 'bg-teal-600',
  },
  orange: {
    header: 'bg-amber-600 text-white',
    soft: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-800',
    icon: 'bg-amber-100 text-amber-700',
    badge: 'border-amber-300 bg-amber-50 text-amber-800',
    line: 'bg-amber-500',
  },
  slate: {
    header: 'bg-slate-700 text-white',
    soft: 'bg-slate-50',
    border: 'border-slate-200',
    text: 'text-slate-700',
    icon: 'bg-slate-100 text-slate-700',
    badge: 'border-slate-300 bg-white text-slate-700',
    line: 'bg-slate-500',
  },
};

const dataCollection: StageItem[] = [
  { icon: UserRound, title: 'Employee Information' },
  { icon: WalletCards, title: 'Earnings', detail: 'Allowances, Overtime, Bonus, Arrears' },
  { icon: ReceiptText, title: 'Deductions', detail: 'PAYE, Pension, NHF, Loans' },
  { icon: CalendarDays, title: 'Time Data', detail: 'Attendance, Leave, Timesheets, Overtime' },
];

const preValidation = [
  'Active Employees',
  'Bank Details Available',
  'Tax Setup Complete',
  'Pension Setup Complete',
  'No Duplicate Payroll',
  'Attendance Processed',
  'Timesheets Approved',
  'Leave Processed',
];

const computationAdditions = ['Gross Earnings', 'Variable Earnings', 'Overtime', 'Bonus / Arrears'];
const computationDeductions = ['PAYE', 'Pension', 'NHF', 'Loans', 'Other Deductions'];

const approvals: ApprovalStep[] = [
  {
    title: '4.1 Payroll Officer',
    icon: UserRound,
    tone: 'blue',
    actions: ['Generate Payroll', 'Validate Payroll', 'Review Exceptions'],
    status: 'DRAFT',
  },
  {
    title: '4.2 HR Manager',
    icon: UsersRound,
    tone: 'green',
    actions: ['Review New Employees', 'Review Exits', 'Review Salary Changes', 'Review Leave Impact'],
    status: 'HR REVIEWED',
  },
  {
    title: '4.3 Finance Manager',
    icon: Banknote,
    tone: 'orange',
    actions: ['Review Cost Centre Impact', 'Review Budget Availability', 'Review Payroll Variance'],
    status: 'FINANCE REVIEWED',
  },
  {
    title: '4.4 CFO',
    icon: Landmark,
    tone: 'purple',
    actions: ['Review Payroll Summary', 'Review Variance Analysis', 'Review Headcount Changes'],
    status: 'CFO APPROVED',
  },
  {
    title: '4.5 MD / CEO Optional',
    icon: Building2,
    tone: 'teal',
    actions: ['Final Review', 'Executive Approval'],
    status: 'FINAL APPROVED',
  },
];

const payrollRelease = [
  { icon: Landmark, label: 'Payroll Released' },
  { icon: FileText, label: 'Bank Schedule Generated' },
  { icon: Banknote, label: 'Payments Processed' },
  { icon: Mail, label: 'Payslips Published' },
];

const payrollTypes = ['Monthly Payroll', 'Weekly Payroll', 'Contract Payroll', 'Daily Rate Payroll', 'Off-Cycle Payroll', 'Bonus Payroll', 'Final Settlement Payroll'];

const workflowFeatures = [
  { icon: GitBranch, label: 'Configurable Approval Levels' },
  { icon: CheckCircle2, label: 'Threshold Based Approvals' },
  { icon: UserRound, label: 'Delegation of Authority' },
  { icon: Bell, label: 'Escalation Rules' },
  { icon: ClipboardCheck, label: 'Audit Trail at Every Step' },
  { icon: Mail, label: 'Email / In-App Notifications' },
];

function HeaderBand({ number, title, tone }: { number: string; title: string; tone: StageTone }) {
  return (
    <div className={`rounded-md px-4 py-3 text-center text-sm font-black uppercase tracking-normal shadow-sm ${toneStyles[tone].header}`}>
      {number}. {title}
    </div>
  );
}

function FlowArrow({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center text-slate-500 ${className}`}>
      <ArrowRight className="h-8 w-8 stroke-[3]" />
    </div>
  );
}

function AuditBox() {
  return (
    <div className="mx-auto mt-3 flex min-h-[54px] w-[132px] items-center justify-center rounded-md border border-slate-200 bg-white px-2 py-2 text-center shadow-sm">
      <FileLock2 className="mr-2 h-4 w-4 text-slate-500" />
      <div className="text-[10px] font-bold leading-tight text-slate-700">
        <div>Action Logged</div>
        <div>Audit Trail Captured</div>
      </div>
    </div>
  );
}

function Panel({ title, tone = 'blue', children }: { title: string; tone?: StageTone; children: ReactNode }) {
  return (
    <section className={`rounded-lg border bg-white p-4 shadow-sm ${toneStyles[tone].border}`}>
      <h3 className={`mb-3 text-center text-sm font-black uppercase tracking-normal ${toneStyles[tone].text}`}>{title}</h3>
      {children}
    </section>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2 text-[12px] font-semibold leading-snug text-slate-700">
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-slate-500" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default function PayrollWorkflowClient() {
  return (
    <main className="min-h-screen bg-white p-4 text-slate-950 sm:p-6">
      <div className="mx-auto max-w-[1900px] overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="min-w-[1680px]">
          <header className="mb-6 text-center">
            <h1 className="text-4xl font-black uppercase tracking-normal text-slate-950">PAYROLL COMPUTATION &amp; APPROVAL WORKFLOW</h1>
            <p className="mt-2 text-xl font-semibold text-slate-500">End-to-End Payroll Process with Multi-Level Approval and Audit Control</p>
          </header>

          <section className="grid grid-cols-[190px_28px_210px_28px_210px_28px_760px_28px_190px] gap-3">
            <HeaderBand number="1" title="Data Collection" tone="blue" />
            <div />
            <HeaderBand number="2" title="Pre-Validation" tone="green" />
            <div />
            <HeaderBand number="3" title="Payroll Computation" tone="purple" />
            <div />
            <HeaderBand number="4" title="Approval Workflow" tone="navy" />
            <div />
            <HeaderBand number="5" title="Payroll Release" tone="navy" />

            <div className="rounded-lg border border-blue-200 bg-white p-4 shadow-sm">
              <div className="space-y-4">
                {dataCollection.map((item) => (
                  <div key={item.title} className="flex gap-3 border-b border-slate-200 pb-3 last:border-b-0 last:pb-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-100 text-blue-700">
                      <item.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-900">{item.title}</p>
                      {item.detail ? <p className="mt-1 text-[12px] font-semibold leading-snug text-slate-600">{item.detail}</p> : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <FlowArrow />

            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
              <div className="mb-3 flex justify-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-emerald-200 bg-white text-emerald-700">
                  <ShieldCheck className="h-7 w-7" />
                </div>
              </div>
              <div className="mb-3 border-t border-emerald-200" />
              <ul className="space-y-2">
                {preValidation.map((item) => (
                  <li key={item} className="flex items-center gap-2 text-[12px] font-bold text-slate-800">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 rounded-md border border-emerald-300 bg-white px-3 py-3 text-center text-sm font-black text-emerald-800 shadow-sm">
                Validation Report Generated
              </div>
            </div>

            <FlowArrow />

            <div className="rounded-lg border border-violet-200 bg-violet-50 p-4 shadow-sm">
              <div className="mb-3 flex justify-center">
                <Calculator className="h-14 w-14 text-violet-800" />
              </div>
              <div className="rounded-md bg-violet-100 px-3 py-2 text-center text-sm font-black text-violet-950">Gross Earnings</div>
              <ul className="mt-3 space-y-2 text-sm font-bold text-slate-800">
                {computationAdditions.slice(1).map((item) => (
                  <li key={item}>+ {item}</li>
                ))}
              </ul>
              <div className="my-3 border-t border-dashed border-violet-500" />
              <div className="rounded-md bg-violet-600 px-3 py-2 text-center text-sm font-black text-white">= GROSS PAY</div>
              <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-3">
                <p className="text-[12px] font-black text-rose-900">Less:</p>
                <ul className="mt-1 space-y-1 text-[12px] font-bold text-slate-800">
                  {computationDeductions.map((item) => (
                    <li key={item}>- {item}</li>
                  ))}
                </ul>
              </div>
              <div className="mt-3 rounded-md bg-fuchsia-700 px-3 py-2 text-center text-sm font-black text-white">= NET PAY</div>
            </div>

            <FlowArrow />

            <div>
              <div className="grid grid-cols-5 gap-3">
                {approvals.map((step, index) => {
                  const tone = toneStyles[step.tone];
                  return (
                    <div key={step.title} className={`relative rounded-lg border bg-white p-3 shadow-sm ${tone.border}`}>
                      {index < approvals.length - 1 ? (
                        <ArrowRight className="absolute -right-7 top-[112px] z-10 h-7 w-7 stroke-[3] text-slate-700" />
                      ) : null}
                      <h4 className={`min-h-[36px] text-center text-sm font-black leading-tight ${tone.text}`}>{step.title}</h4>
                      <div className="my-4 flex justify-center">
                        <div className={`flex h-14 w-14 items-center justify-center rounded-full border ${tone.border} ${tone.icon}`}>
                          <step.icon className="h-8 w-8" />
                        </div>
                      </div>
                      <ul className="min-h-[104px] space-y-2 text-[11px] font-semibold leading-snug text-slate-700">
                        {step.actions.map((action) => (
                          <li key={action} className="flex gap-2">
                            <span className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full bg-slate-500" />
                            <span>{action}</span>
                          </li>
                        ))}
                      </ul>
                      <div className={`mt-3 rounded-md border px-2 py-3 text-center text-sm font-black ${tone.badge}`}>Status: {step.status}</div>
                    </div>
                  );
                })}
              </div>
              <div className="grid grid-cols-5 gap-3">
                {approvals.map((step) => (
                  <div key={`${step.title}-audit`} className="relative">
                    <div className="mx-auto h-6 w-px border-l border-dashed border-slate-400" />
                    <AuditBox />
                  </div>
                ))}
              </div>
              <div className="mx-[76px] mt-1 border-t-2 border-dashed border-slate-400" />
            </div>

            <FlowArrow />

            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="space-y-4">
                {payrollRelease.map((item, index) => (
                  <div key={item.label} className="text-center">
                    <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-md bg-teal-50 text-teal-700">
                      <item.icon className="h-6 w-6" />
                    </div>
                    <p className="mt-2 text-sm font-bold leading-tight text-slate-800">{item.label}</p>
                    {index < payrollRelease.length - 1 ? <div className="mx-auto mt-3 h-7 w-px bg-slate-400" /> : null}
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="mt-8 grid grid-cols-[250px_410px_390px_300px_220px] gap-4">
            <Panel title="Payroll Types Supported" tone="blue">
              <BulletList items={payrollTypes} />
            </Panel>

            <Panel title="Payroll Outputs" tone="purple">
              <div className="grid grid-cols-3 gap-3 text-[12px]">
                <div>
                  <h4 className="mb-2 flex items-center gap-2 font-black text-violet-800"><FileText className="h-4 w-4" />Employee Outputs</h4>
                  <BulletList items={['Payslip', 'Tax Summary', 'Pension Summary']} />
                </div>
                <div>
                  <h4 className="mb-2 flex items-center gap-2 font-black text-violet-800"><FileCheck2 className="h-4 w-4" />Management Outputs</h4>
                  <BulletList items={['Payroll Register', 'Department Summary', 'Cost Centre Summary', 'Project Payroll Summary']} />
                </div>
                <div>
                  <h4 className="mb-2 flex items-center gap-2 font-black text-violet-800"><ReceiptText className="h-4 w-4" />Statutory Outputs</h4>
                  <BulletList items={['PAYE Schedule', 'Pension Schedule', 'NHF Schedule', 'NSITF Schedule', 'ITF Schedule']} />
                </div>
              </div>
            </Panel>

            <Panel title="Payroll Locking Controls" tone="orange">
              <div className="grid grid-cols-[1fr_1px_1fr] gap-4 text-[12px] font-semibold text-slate-700">
                <div>
                  <div className="mb-2 flex items-center gap-2 font-black text-amber-800"><LockKeyhole className="h-5 w-5" />After final approval, system locks:</div>
                  <BulletList items={['Salary Structure', 'Payroll Transactions', 'Attendance Records', 'Timesheets', 'Overtime Records']} />
                </div>
                <div className="bg-amber-200" />
                <div>
                  <p className="font-black text-slate-900">No changes allowed.</p>
                  <p className="mt-3 font-black text-slate-900">Any adjustment requires:</p>
                  <div className="mt-3 space-y-2 text-center font-black text-amber-800">
                    <p>Payroll Reopening Request</p>
                    <ArrowRight className="mx-auto h-4 w-4 rotate-90" />
                    <p>CFO Approval</p>
                    <ArrowRight className="mx-auto h-4 w-4 rotate-90" />
                    <p>Audit Trail Created</p>
                  </div>
                </div>
              </div>
            </Panel>

            <Panel title="Workflow Features" tone="green">
              <ul className="space-y-3 text-[12px] font-semibold text-slate-700">
                {workflowFeatures.map((feature) => (
                  <li key={feature.label} className="flex items-center gap-3">
                    <feature.icon className="h-4 w-4 shrink-0 text-emerald-700" />
                    <span>{feature.label}</span>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel title="Legend" tone="blue">
              <div className="space-y-3 text-[12px] font-bold text-slate-700">
                {[
                  ['Data & Processing', 'blue'],
                  ['Validation', 'green'],
                  ['Computation', 'purple'],
                  ['Approval', 'navy'],
                  ['Release / Output', 'teal'],
                ].map(([label, tone]) => (
                  <div key={label} className="flex items-center gap-3">
                    <span className={`h-3 w-10 rounded-sm ${toneStyles[tone as StageTone].line}`} />
                    <span>{label}</span>
                  </div>
                ))}
                <div className="pt-2">
                  <div className="mb-3 flex items-center gap-3">
                    <span className="h-px w-10 bg-slate-800" />
                    <span>Solid arrow = Process Flow</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-10 border-t-2 border-dashed border-slate-500" />
                    <span>Dotted arrow = Audit Trail</span>
                  </div>
                </div>
              </div>
            </Panel>
          </section>

          <footer className="mt-7 inline-flex rounded-md border border-blue-200 bg-blue-50 px-6 py-3 text-sm font-black uppercase tracking-normal text-blue-900">
            KEY PRINCIPLES: Integrity <span className="px-4 text-blue-300">|</span> Accuracy <span className="px-4 text-blue-300">|</span> Accountability <span className="px-4 text-blue-300">|</span> Transparency <span className="px-4 text-blue-300">|</span> Compliance <span className="px-4 text-blue-300">|</span> Security
          </footer>
        </div>
      </div>
    </main>
  );
}
