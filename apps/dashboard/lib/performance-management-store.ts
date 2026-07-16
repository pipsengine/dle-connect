/**
 * Compatibility shim — Performance Management now persists via performance-domain-store.
 * Prefer importing from `@/lib/performance-domain-store` for new code.
 */
export {
  applyPerformanceAction,
  getEssPerformanceBundle,
  readPerformanceManagementPayload,
  updatePerformanceNavAction,
  writePerformanceNavPreferences,
} from '@/lib/performance-domain-store';
