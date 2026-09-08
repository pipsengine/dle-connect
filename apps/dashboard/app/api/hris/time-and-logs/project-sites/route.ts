import { NextResponse } from 'next/server';
import { dedupeTimesheetLocationLabels, normalizeTimesheetLocationLabel } from '@/lib/timesheet-agege-blasting';
import { readSystemTimesheetLocations } from '@/lib/timesheet-entry-store';

export async function GET() {
  const locations = await readSystemTimesheetLocations();
  const normalizedLocations = locations.map((location) => {
    const name = normalizeTimesheetLocationLabel(location.name) || location.name;
    const site = normalizeTimesheetLocationLabel(location.site) || location.site;
    return { ...location, name, site };
  });
  const projectSites = dedupeTimesheetLocationLabels(
    normalizedLocations
      .flatMap((location) => [location.site, location.name])
      .filter((site) => site && site !== 'Unassigned Location'),
  );

  return NextResponse.json({
    status: 'success',
    data: {
      projectSites,
      locations: normalizedLocations,
      source: 'DLE_Enterprise.hris.TimesheetLocations',
    },
  });
}
