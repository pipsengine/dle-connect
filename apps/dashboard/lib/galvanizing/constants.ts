export const GALVANIZING_STAGES = [
  'SCHEDULED',
  'DEGREASING',
  'RINSING_1',
  'PICKLING',
  'RINSING_2',
  'FLUXING',
  'DRYING',
  'DIPPING',
  'COOLING',
  'FINISHING',
  'FINAL_QC',
  'COMPLETED',
] as const;

export type GalvanizingStage = (typeof GALVANIZING_STAGES)[number];

export const GALVANIZING_STAGE_LABELS: Record<GalvanizingStage, string> = {
  SCHEDULED: 'Scheduled',
  DEGREASING: 'Degreasing',
  RINSING_1: 'Rinse',
  PICKLING: 'Pickling',
  RINSING_2: 'Rinse',
  FLUXING: 'Fluxing',
  DRYING: 'Drying',
  DIPPING: 'Zinc dipping',
  COOLING: 'Cooling / quench',
  FINISHING: 'Finishing',
  FINAL_QC: 'Final QC',
  COMPLETED: 'Completed',
};

export const GALVANIZING_MATERIALS = [
  { material: 'Zinc', category: 'Zinc', unit: 'kg', reorder: 5000, location: 'Raw Materials Store' },
  { material: 'Hydrochloric Acid', category: 'Chemicals', unit: 'L', reorder: 250, location: 'Chemical Store' },
  { material: 'Flux', category: 'Chemicals', unit: 'L', reorder: 200, location: 'Chemical Store' },
  { material: 'Degreaser', category: 'Chemicals', unit: 'L', reorder: 150, location: 'Chemical Store' },
] as const;

export const NCR_DISPOSITIONS = ['HOLD', 'REPAIR', 'REGALVANIZE', 'RETURN', 'CONCESSION', 'SCRAP'] as const;

export type NcrDisposition = (typeof NCR_DISPOSITIONS)[number];
