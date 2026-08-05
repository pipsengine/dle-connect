import { NextResponse } from 'next/server';
import { previewNextEmployeeCodeFromDb } from '@/lib/dle-enterprise-db';

const jsonOk = (data: any) => NextResponse.json({ status: 'success', data });
const jsonErr = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

const employeeTypePrefix = (employeeType: unknown) => {
  const normalized = String(employeeType || '').trim().toLowerCase();
  if (normalized === 'permanent') return 'P';
  if (normalized === 'lumpsum') return 'L';
  if (normalized === 'daily rate') return 'C';
  if (normalized === 'nysc' || normalized.includes('nysc')) return 'N';
  if (
    normalized === 'it' ||
    normalized === 'intern' ||
    normalized.includes('industrial trainee') ||
    normalized.includes('industrial training') ||
    normalized.includes('industrial attachment') ||
    normalized.includes('intern')
  ) return 'I';
  return '';
};

const nextPreviewFallback = (employeeType: string) => {
  const prefix = employeeTypePrefix(employeeType) || 'P';
  return `${prefix}0001`;
};

export async function GET(request: Request) {
  const employeeType = new URL(request.url).searchParams.get('employeeType') || '';
  const prefix = employeeTypePrefix(employeeType);
  if (!prefix) return jsonErr(400, 'employeeType must be Permanent, Lumpsum, Daily Rate, NYSC, IT, Intern, or Industrial Trainee');
  const employeeCode = (await previewNextEmployeeCodeFromDb(employeeType)) || nextPreviewFallback(employeeType);
  return jsonOk({ employeeCode, prefix, employeeType });
}
