import type { ItAssetRecord } from '@/lib/it-asset-management-store';

export type DashboardCategoryBucket = 'Laptops' | 'Desktops' | 'Printers' | 'Network Equipment' | 'Others';

const CATEGORY_COLORS: Record<DashboardCategoryBucket, string> = {
  Laptops: '#3b82f6',
  Desktops: '#22c55e',
  Printers: '#8b5cf6',
  'Network Equipment': '#f97316',
  Others: '#14b8a6',
};

const CATEGORY_ORDER: DashboardCategoryBucket[] = ['Laptops', 'Desktops', 'Printers', 'Network Equipment', 'Others'];

export const mapAssetToDashboardCategory = (asset: ItAssetRecord): DashboardCategoryBucket => {
  const category = (asset.category || '').toLowerCase();
  const subCategory = (asset.subCategory || '').toLowerCase();
  if (category === 'laptop' || subCategory === 'laptop') return 'Laptops';
  if (category === 'desktop' || subCategory === 'desktop' || subCategory === 'monitor') return 'Desktops';
  if (category === 'printer' || subCategory === 'printer') return 'Printers';
  if (category === 'network' || ['router', 'switch', 'firewall', 'network'].includes(subCategory)) return 'Network Equipment';
  return 'Others';
};

export const buildDashboardCategoryBreakdown = (assets: ItAssetRecord[]) => {
  const counts = new Map<DashboardCategoryBucket, number>();
  for (const bucket of CATEGORY_ORDER) counts.set(bucket, 0);
  for (const asset of assets) {
    const bucket = mapAssetToDashboardCategory(asset);
    counts.set(bucket, (counts.get(bucket) || 0) + 1);
  }
  const total = assets.length || 1;
  return CATEGORY_ORDER
    .map((name) => {
      const value = counts.get(name) || 0;
      if (!value) return null;
      return {
        name,
        value,
        pct: Math.round((value / total) * 1000) / 10,
        color: CATEGORY_COLORS[name],
      };
    })
    .filter((item): item is { name: DashboardCategoryBucket; value: number; pct: number; color: string } => Boolean(item));
};

export const formatAssetTypeLabel = (asset: ItAssetRecord) => {
  const sub = asset.subCategory || asset.category || 'Other';
  if (sub.toLowerCase() === 'laptop') return 'Laptop';
  if (sub.toLowerCase() === 'desktop') return 'Desktop';
  return sub;
};

export const buildPageNumbers = (current: number, total: number, maxButtons = 5) => {
  if (total <= maxButtons) return Array.from({ length: total }, (_, index) => index + 1);
  const half = Math.floor(maxButtons / 2);
  let start = Math.max(1, current - half);
  let end = Math.min(total, start + maxButtons - 1);
  start = Math.max(1, end - maxButtons + 1);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
};
