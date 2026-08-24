import { NextResponse } from 'next/server';
import { previewNextEmployeeCodeFromDb } from '@/lib/dle-enterprise-db';

const jsonOk = (data: any) => NextResponse.json({ status: 'success', data });
const jsonErr = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

const employeeTypePrefix = (employeeType: unknown) => {
  const normalized = typeof employeeType === 'string'
    ? employeeType.trim().toLowerCase().replace(/[-_\s]+/g, '')
    : '';
  if (!normalized) return '';
  if (normalized.includes('permanent')) return 'P';
  if (normalized.includes('lumpsum') || normalized.includes('lumpsumcontract') || normalized.includes('contractlumpsum')) return 'L';
  if (
    normalized.includes('daily') ||
    normalized.includes('dayrate') ||
    normalized.includes('casual') ||
    normalized === 'contract' ||
    normalized.includes('contractstaff')
  ) return 'C';
  if (normalized.includes('nysc') || normalized.includes('corper')) return 'N';
  if (
    normalized === 'it' ||
    normalized.includes('intern') ||
    normalized.includes('industrialtrainee') ||
    normalized.includes('industrialtraining') ||
    normalized.includes('industrialattachment') ||
    normalized.includes('siwes')
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
