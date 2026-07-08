import { NextResponse } from 'next/server';
import {
  deactivateTimesheetWorkCenter,
  readTimesheetWorkCenters,
  upsertTimesheetWorkCenter,
  type TimesheetWorkCenter,
} from '@/lib/timesheet-entry-store';

const ok = <T,>(data: T) => NextResponse.json({ status: 'success', data });
const err = (status: number, error: string) => NextResponse.json({ status: 'error', error }, { status });

const buildPayload = async () => {
  const workCenters = await readTimesheetWorkCenters({ includeInactive: true });
  const active = workCenters.filter((item) => item.status === 'Active');
  const inactive = workCenters.filter((item) => item.status !== 'Active');
  return {
    generatedAt: new Date().toISOString(),
    source: 'DLE_Enterprise hris.TimesheetWorkCenters',
    summary: {
      total: workCenters.length,
      active: active.length,
      inactive: inactive.length,
    },
    workCenters,
  };
};

export async function GET() {
  try {
    return ok(await buildPayload());
  } catch (error) {
    return err(500, error instanceof Error ? error.message : 'Unable to load work centers.');
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      workCenter?: Partial<TimesheetWorkCenter> & { name?: string; id?: string };
    };
    const action = String(body.action || 'upsert').trim().toLowerCase();

    if (action === 'deactivate' || action === 'delete') {
      const id = String(body.workCenter?.id || '').trim();
      if (!id) return err(400, 'Work center ID is required.');
      await deactivateTimesheetWorkCenter(id);
      return ok(await buildPayload());
    }

    if (action === 'activate') {
      const id = String(body.workCenter?.id || '').trim();
      const name = String(body.workCenter?.name || '').trim();
      if (!id || !name) return err(400, 'Work center ID and name are required to reactivate.');
      await upsertTimesheetWorkCenter({
        ...body.workCenter,
        id,
        name,
        status: 'Active',
        sourceSystem: body.workCenter?.sourceSystem || 'HRIS Organization',
      });
      return ok(await buildPayload());
    }

    const name = String(body.workCenter?.name || '').trim();
    if (!name) return err(400, 'Work center name is required.');
    await upsertTimesheetWorkCenter({
      ...body.workCenter,
      name,
      status: body.workCenter?.status === 'Inactive' ? 'Inactive' : 'Active',
      sourceSystem: body.workCenter?.sourceSystem || 'HRIS Organization',
    });
    return ok(await buildPayload());
  } catch (error) {
    return err(400, error instanceof Error ? error.message : 'Unable to save work center.');
  }
}

export async function PATCH(request: Request) {
  return POST(request);
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id')?.trim() || '';
    if (!id) return err(400, 'Work center ID is required.');
    await deactivateTimesheetWorkCenter(id);
    return ok(await buildPayload());
  } catch (error) {
    return err(400, error instanceof Error ? error.message : 'Unable to delete work center.');
  }
}
