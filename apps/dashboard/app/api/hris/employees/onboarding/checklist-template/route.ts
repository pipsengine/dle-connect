import { NextResponse } from 'next/server';

type ChecklistItem = {
  id: string;
  title: string;
  status: string;
  responsibleOfficer: string;
  dueDate: string;
  notes: string;
};

const jsonOk = <T,>(data: T) => NextResponse.json({ status: 'success', data });

const templateChecklist = (): ChecklistItem[] => [
  { id: 'chk-1', title: 'HR profile completed', status: 'Pending', responsibleOfficer: 'HR Officer', dueDate: '', notes: '' },
  { id: 'chk-2', title: 'Employment letter issued', status: 'Pending', responsibleOfficer: 'HR Officer', dueDate: '', notes: '' },
  { id: 'chk-3', title: 'Documents verified', status: 'Pending', responsibleOfficer: 'Compliance Officer', dueDate: '', notes: '' },
  { id: 'chk-4', title: 'Payroll setup completed', status: 'Pending', responsibleOfficer: 'Payroll Officer', dueDate: '', notes: '' },
  { id: 'chk-5', title: 'Email account requested', status: 'Pending', responsibleOfficer: 'IT Administrator', dueDate: '', notes: '' },
  { id: 'chk-6', title: 'Laptop requested', status: 'Pending', responsibleOfficer: 'IT Administrator', dueDate: '', notes: '' },
  { id: 'chk-7', title: 'Access card requested', status: 'Pending', responsibleOfficer: 'Admin Officer', dueDate: '', notes: '' },
  { id: 'chk-8', title: 'PPE requested', status: 'Pending', responsibleOfficer: 'HSE Officer', dueDate: '', notes: '' },
  { id: 'chk-9', title: 'Department induction scheduled', status: 'Pending', responsibleOfficer: 'Department Head', dueDate: '', notes: '' },
  { id: 'chk-10', title: 'HSE induction scheduled', status: 'Pending', responsibleOfficer: 'HSE Officer', dueDate: '', notes: '' },
  { id: 'chk-11', title: 'IT onboarding scheduled', status: 'Pending', responsibleOfficer: 'IT Administrator', dueDate: '', notes: '' },
  { id: 'chk-12', title: 'Line manager assigned', status: 'Pending', responsibleOfficer: 'HR Officer', dueDate: '', notes: '' },
  { id: 'chk-13', title: 'Probation tracker created', status: 'Pending', responsibleOfficer: 'HR Officer', dueDate: '', notes: '' },
  { id: 'chk-14', title: 'Leave entitlement initialized', status: 'Pending', responsibleOfficer: 'HR Officer', dueDate: '', notes: '' },
];

/** GET /api/hris/employees/onboarding/checklist-template — static path beats [id]/[...resource]. */
export async function GET() {
  return jsonOk(templateChecklist());
}
