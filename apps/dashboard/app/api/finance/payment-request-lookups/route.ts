import { NextResponse } from 'next/server';
import { buildPaymentRequestLookups } from '@/lib/finance-intelligence/payment-request-lookups';

const jsonOk = <T,>(data: T) => NextResponse.json({ status: 'success', data });
const jsonErr = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

export async function GET() {
  try {
    return jsonOk(await buildPaymentRequestLookups());
  } catch (error) {
    return jsonErr(500, error instanceof Error ? error.message : 'Unable to load payment request lookups.');
  }
}
