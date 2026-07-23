/** Standard enterprise expiry notification windows (days). */
export const SOFTWARE_ALERT_PERIODS = [90, 60, 30, 14, 7] as const;
export type SoftwareAlertPeriod = (typeof SOFTWARE_ALERT_PERIODS)[number];

export type SoftwareAlertPeriodConfig = {
  days: SoftwareAlertPeriod;
  enabled: boolean;
};

export type SoftwareAlertConfig = {
  enabled: boolean;
  periods: SoftwareAlertPeriodConfig[];
  recipientEmails: string[];
  channels: Array<'In-App' | 'Email'>;
  updatedAt: string | null;
  updatedBy: string | null;
  lastRunAt: string | null;
  sentLog: Array<{
    licenseId: string;
    productName: string;
    period: number;
    sentOn: string;
    channels: string[];
  }>;
};

export type SoftwareLicenseMetrics = {
  totalLicenses: number;
  inCompliance: number;
  overLicensed: number;
  underLicensed: number;
  expiringSoon: number;
  expired: number;
  seatsTotal: number;
  seatsUsed: number;
  annualCost: number;
  byPeriod: Record<SoftwareAlertPeriod, number>;
};
