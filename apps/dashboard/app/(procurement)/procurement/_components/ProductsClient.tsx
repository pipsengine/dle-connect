'use client';

import { useCallback, useEffect, useState } from 'react';
import { CloudDownload, Loader2, Package, RefreshCw } from 'lucide-react';
import { procurementGet, procurementPost } from '../lib/procurement-api';
import { FilterBar, KpiCard, PaginationFooter, RegisterTable, inputClass, primaryBtnClass, secondaryBtnClass } from './proc-ui';

type ProductRow = {
  productId: string;
  itemCode: string;
  description: string;
  description2: string | null;
  category: string | null;
  uom: string;
  stockManagement: 'Managed' | 'Unmanaged';
  status: string | null;
  isPurchased: boolean;
  isActive: boolean;
  source: string;
  syncedAt: string | null;
};

type CardFilter = '' | 'Managed' | 'Unmanaged' | 'Active';

type ProductPayload = {
  products: ProductRow[];
  counts: {
    managed: number;
    unmanaged: number;
    active: number;
    total: number;
    managedPurchased: number;
    unmanagedPurchased: number;
    activePurchased: number;
    categories: number;
  };
  filtered: { total: number; purchased: number; active: number; categories: number };
  page: number;
  pageSize: number;
  database: string;
  syncedAt: string | null;
};

const emptyPayload = (): ProductPayload => ({
  products: [],
  counts: { managed: 0, unmanaged: 0, active: 0, total: 0, managedPurchased: 0, unmanagedPurchased: 0, activePurchased: 0, categories: 0 },
  filtered: { total: 0, purchased: 0, active: 0, categories: 0 },
  page: 1,
  pageSize: 25,
  database: 'DLE_Enterprise',
  syncedAt: null,
});

const cardCopy: Record<Exclude<CardFilter, ''>, { title: string; body: string }> = {
  Managed: {
    title: 'Managed products',
    body: 'Stocked items from the Sage item master. Purchase requisitions can pick these by item code.',
  },
  Unmanaged: {
    title: 'Unmanaged products',
    body: 'Non-stock items such as services and expenses. They stay in the same catalog and can still be purchased.',
  },
  Active: {
    title: 'Active products',
    body: 'Every usable item currently marked active, both stocked and non-stock.',
  },
};

const formatWhen = (value: string | null) => (value ? new Date(value).toLocaleString() : 'Not synced yet');

export function ProductsClient() {
  const [data, setData] = useState<ProductPayload>(emptyPayload);
  const [card, setCard] = useState<CardFilter>('');
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selected, setSelected] = useState<ProductRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const management = card === 'Managed' || card === 'Unmanaged' ? card : '';
    try {
      const payload = await procurementGet<ProductPayload>('products', {
        q: appliedQuery,
        management,
        active: card ? '1' : '0',
        page: String(page),
        pageSize: String(pageSize),
      });
      setData(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load products');
    } finally {
      setLoading(false);
    }
  }, [appliedQuery, card, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectCard = (next: Exclude<CardFilter, ''>) => {
    setCard((current) => (current === next ? '' : next));
    setPage(1);
    setSelected(null);
  };

  const sync = async () => {
    setSyncing(true);
    setError('');
    try {
      await procurementPost('sync-sage-products');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sage product sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const detail = card ? cardCopy[card] : null;
  const purchased = data.filtered.purchased;
  const listTitle = card === 'Managed' ? 'Managed products' : card === 'Unmanaged' ? 'Unmanaged products' : card === 'Active' ? 'Active products' : 'All products';
  const databaseLabel = data.database || 'DLE_Enterprise';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Products</h1>
          <p className="text-sm text-slate-500">
            Sage X3 item master, stored in {databaseLabel} · procurement.Products. Managed products are stocked. Unmanaged products are non-stock, such as services and expenses.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" className={secondaryBtnClass} onClick={() => void load()} disabled={loading || syncing}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh
          </button>
          <button type="button" className={primaryBtnClass} onClick={() => void sync()} disabled={syncing}>
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudDownload className="h-4 w-4" />}
            {syncing ? 'Syncing Sage…' : 'Sync from Sage'}
          </button>
        </div>
      </div>
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard label="Managed" value={data.counts.managed.toLocaleString()} icon={<Package className="h-4 w-4" />} active={card === 'Managed'} onClick={() => selectCard('Managed')} hint="Stock managed · click for the list" />
        <KpiCard label="Unmanaged" value={data.counts.unmanaged.toLocaleString()} icon={<Package className="h-4 w-4" />} tint="bg-amber-50 text-amber-700" active={card === 'Unmanaged'} onClick={() => selectCard('Unmanaged')} hint="Not stock managed · click for the list" />
        <KpiCard label="Active products" value={data.counts.active.toLocaleString()} icon={<Package className="h-4 w-4" />} tint="bg-slate-100 text-slate-700" active={card === 'Active'} onClick={() => selectCard('Active')} hint={data.syncedAt ? `Synced ${formatWhen(data.syncedAt)}` : 'Not synced yet'} />
      </div>
      {detail ? (
        <section className="rounded-xl border border-blue-200 bg-blue-50/50 p-4">
          <h2 className="text-sm font-semibold text-slate-900">{detail.title}</h2>
          <p className="mt-1 text-sm text-slate-600">{detail.body}</p>
          <dl className="mt-3 grid gap-3 sm:grid-cols-4">
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Matching rows</dt>
              <dd className="text-lg font-semibold text-slate-900">{data.filtered.total.toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Purchased</dt>
              <dd className="text-lg font-semibold text-slate-900">{purchased.toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Categories</dt>
              <dd className="text-lg font-semibold text-slate-900">{data.filtered.categories.toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Database</dt>
              <dd className="text-sm font-semibold text-slate-900">{databaseLabel}</dd>
              <dd className="text-xs text-slate-500">procurement.Products</dd>
            </div>
          </dl>
        </section>
      ) : null}
      {selected ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Product detail</div>
              <h2 className="text-lg font-semibold text-slate-900">{selected.itemCode}</h2>
              <p className="text-sm text-slate-600">{selected.description}</p>
            </div>
            <button type="button" className={secondaryBtnClass} onClick={() => setSelected(null)}>Close</button>
          </div>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
            {[
              ['Second description', selected.description2 || '—'],
              ['Category', selected.category || '—'],
              ['Unit', selected.uom],
              ['Control', selected.stockManagement],
              ['Status', `${selected.status || '—'}${selected.isActive ? '' : ' · inactive'}`],
              ['Purchased', selected.isPurchased ? 'Yes' : 'No'],
              ['Source', selected.source || 'SAGE'],
              ['Synced', formatWhen(selected.syncedAt)],
              ['Record', selected.productId],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
                <dd className="mt-0.5 text-slate-800">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
      <FilterBar>
        <label className="min-w-64 flex-1 text-sm">
          <span className="mb-1 block text-xs font-semibold text-slate-600">Search</span>
          <input
            className={inputClass}
            value={query}
            placeholder="Code, description, or category"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              setAppliedQuery(event.currentTarget.value.trim());
              setPage(1);
            }}
          />
        </label>
        <button
          type="button"
          className={secondaryBtnClass}
          onClick={() => {
            setAppliedQuery(query.trim());
            setPage(1);
          }}
        >
          Search
        </button>
      </FilterBar>
      <RegisterTable title={listTitle} count={data.filtered.total}>
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              {['Code', 'Description', 'Category', 'UOM', 'Control', 'Status', 'Purchased'].map((heading) => (
                <th key={heading} className="px-3 py-2">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.products.map((row) => (
              <tr
                key={row.productId}
                className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50 ${selected?.productId === row.productId ? 'bg-blue-50' : ''}`}
                onClick={() => setSelected(row)}
              >
                <td className="px-3 py-2 font-medium">{row.itemCode}</td>
                <td className="px-3 py-2">{row.description}</td>
                <td className="px-3 py-2">{row.category || '—'}</td>
                <td className="px-3 py-2">{row.uom}</td>
                <td className="px-3 py-2">{row.stockManagement}</td>
                <td className="px-3 py-2">{row.status || '—'}{row.isActive ? '' : ' · inactive'}</td>
                <td className="px-3 py-2">{row.isPurchased ? 'Yes' : 'No'}</td>
              </tr>
            ))}
            {!data.products.length ? (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-500">{loading ? 'Loading products…' : 'No products match this view.'}</td></tr>
            ) : null}
          </tbody>
        </table>
        <PaginationFooter
          page={page}
          pageSize={pageSize}
          total={data.filtered.total}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      </RegisterTable>
    </div>
  );
}
