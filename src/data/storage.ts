import type { DispatchOrder, ReturnEntry, Revision, RouteProfile } from "../domain/types";
import { seedOrders, seedRoutes } from "./seed";

const STORAGE_KEY = "dfwlfront-3-reconcile";
const STORAGE_VERSION = 1;

/** 单键整体持久化,保证任务、预算、票据、修订关系刷新后一致 */
export interface PersistedState {
  version: number;
  routes: RouteProfile[];
  orders: DispatchOrder[];
  returns: ReturnEntry[];
  revisions: Revision[];
}

export function loadState(): PersistedState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<PersistedState>;
      if (parsed && parsed.version === STORAGE_VERSION) {
        return {
          version: STORAGE_VERSION,
          routes: parsed.routes ?? [],
          orders: parsed.orders ?? [],
          returns: parsed.returns ?? [],
          revisions: parsed.revisions ?? []
        };
      }
    } catch {
      // 数据损坏时回退到种子数据
    }
  }
  return {
    version: STORAGE_VERSION,
    routes: seedRoutes,
    orders: seedOrders,
    returns: [],
    revisions: []
  };
}

export function saveState(state: PersistedState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
