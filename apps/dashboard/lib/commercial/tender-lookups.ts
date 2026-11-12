/** Shared commercial opportunity source and sector lists. */

export const COMMERCIAL_SOURCES = [
  'Walk-in',
  'Telephone',
  'Newspaper/Publication',
  'Email',
  'Invitation',
  'Public Portal',
  'Referral',
  'Tender Portal',
  'Website',
] as const;

export const COMMERCIAL_SECTORS = [
  'Oil & Gas',
  'Non Oil and Gas',
  'Energy',
  'Construction',
  'Infrastructure',
  'Fabrication',
  'Galvanizing',
  'Telecom',
  'Industrial',
  'Maintenance',
  'Marine',
  'IT Services',
] as const;

export type CommercialSource = (typeof COMMERCIAL_SOURCES)[number];
export type CommercialSector = (typeof COMMERCIAL_SECTORS)[number];
