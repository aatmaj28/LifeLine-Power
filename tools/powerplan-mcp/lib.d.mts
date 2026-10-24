// Type declarations for lib.mjs so TypeScript tests get accurate types.

export interface CsvRow {
  [column: string]: string | number;
}

export interface ZipRow {
  zip: string;
  county: string;
  county_fips: string;
  medicare_benes: number;
  power_dependent_dme: number;
  esrd_dialysis_any_dme: number;
  o2_services_any_dme: number;
  home_health_any_dme: number;
  hospice_any_dme: number;
  healthcare_srvc_any_dme: number;
  pct_power_dependent: number;
}

export interface CountyRow extends Omit<ZipRow, "zip"> {}

export interface PowerPlanData {
  zips: ZipRow[];
  counties: CountyRow[];
}

export interface RelatedServices {
  dialysis: string;
  oxygen_services: string;
  home_health: string;
  hospice: string;
}

export interface ZipView {
  zip: string;
  county: string;
  county_fips: string;
  medicare_benes: number;
  power_dependent_dme: number;
  power_dependent_label: string;
  masked: boolean;
  also_relies_on: RelatedServices;
  pct_power_dependent: number;
}

export interface CountySummary {
  county: string;
  county_fips: string;
  medicare_benes: number;
  power_dependent_dme: number;
  power_dependent_label: string;
  pct_power_dependent: number;
  also_relies_on: RelatedServices;
  zip_count: number;
  masked_zip_count: number;
  zip_sum_power_dependent: number;
  source: string;
}

export type QueryResult<T> = { ok: true; value: T } | { ok: false; error: string };

export const DEFAULT_DATA_DIR: string;
export const SOURCE_NOTE: string;
export function label(n: number): string;
export function parseCsv(text: string): CsvRow[];
export function loadData(dir?: string): PowerPlanData;
export function countySummary(data: PowerPlanData, county: string): QueryResult<CountySummary>;
export function topZips(
  data: PowerPlanData,
  options?: { county?: string; limit?: number },
): QueryResult<{ zips: ZipView[]; source: string }>;
export function zipDetail(
  data: PowerPlanData,
  zip: string,
): QueryResult<ZipView & { source: string }>;
