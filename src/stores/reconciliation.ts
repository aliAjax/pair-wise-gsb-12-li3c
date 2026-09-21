import { computed, ref, watch } from "vue";
import { defineStore } from "pinia";
import type { DispatchOrder, ReturnEntry, ReturnSnapshot, Revision } from "../domain/types";
import { evaluateRelease, type ReleaseVerdict } from "../domain/release";
import { evaluateReturn, type ReconcileVerdict } from "../domain/reconcile";
import { loadState, saveState, type PersistedState } from "../data/storage";

export interface ReturnPayload {
  startMileageKm: number;
  endMileageKm: number;
  receipts: { kind: string; amount: number }[];
  note: string;
}

export const useReconciliationStore = defineStore("reconciliation", () => {
  const state = ref<PersistedState>(loadState());

  // 任何变更整体落盘,刷新后任务/预算/票据/修订关系保持一致
  watch(state, (value) => saveState(value), { deep: true });

  const routes = computed(() => state.value.routes);
  const orders = computed(() => state.value.orders);
  const returns = computed(() => state.value.returns);
  const revisions = computed(() => state.value.revisions);

  function routeOf(order: DispatchOrder) {
    return state.value.routes.find((route) => route.id === order.routeId);
  }

  function returnOf(orderId: string) {
    return state.value.returns.find((entry) => entry.orderId === orderId);
  }

  function revisionsOf(orderId: string) {
    return state.value.revisions.filter((revision) => revision.orderId === orderId);
  }

  /** 放行预检:登记与放行前共用同一套判定 */
  function releaseVerdict(order: DispatchOrder): ReleaseVerdict | null {
    const route = routeOf(order);
    return route ? evaluateRelease(order, route) : null;
  }

  /** 回场核销判定 */
  function reconcileVerdict(orderId: string): ReconcileVerdict | null {
    const order = state.value.orders.find((item) => item.id === orderId);
    const entry = returnOf(orderId);
    const route = order && routeOf(order);
    if (!route || !entry) return null;
    return evaluateReturn(route, entry);
  }

  function registerOrder(
    payload: Omit<DispatchOrder, "id" | "status" | "createdAt" | "releasedAt">
  ): DispatchOrder {
    const order: DispatchOrder = {
      ...payload,
      id: crypto.randomUUID(),
      status: "待放行",
      createdAt: new Date().toISOString(),
      releasedAt: null
    };
    state.value.orders.unshift(order);
    return order;
  }

  /** 放行:判定不通过则保持待放行,返回违规项(含差额与触发条件) */
  function releaseOrder(orderId: string): ReleaseVerdict | null {
    const order = state.value.orders.find((item) => item.id === orderId);
    if (!order || order.status !== "待放行") return null;
    const verdict = releaseVerdict(order);
    if (!verdict) return null;
    if (verdict.pass) {
      order.status = "已放行";
      order.releasedAt = new Date().toISOString();
    }
    return verdict;
  }

  /** 回场录入:一单一条,判定后进入已核销或待复核 */
  function submitReturn(orderId: string, payload: ReturnPayload): ReconcileVerdict | null {
    const order = state.value.orders.find((item) => item.id === orderId);
    if (!order || order.status !== "已放行") return null;
    const now = new Date().toISOString();
    state.value.returns.push({
      id: crypto.randomUUID(),
      orderId,
      startMileageKm: payload.startMileageKm,
      endMileageKm: payload.endMileageKm,
      receipts: payload.receipts.map((receipt) => ({ ...receipt, id: crypto.randomUUID() })),
      note: payload.note,
      createdAt: now,
      updatedAt: now
    });
    const verdict = reconcileVerdict(orderId);
    if (verdict) order.status = verdict.outcome;
    return verdict;
  }

  /** 补录:写原因、生成修订(保留原预算与原始录入),并重新判定 */
  function supplementReturn(
    orderId: string,
    payload: ReturnPayload,
    reason: string
  ): ReconcileVerdict | null {
    const order = state.value.orders.find((item) => item.id === orderId);
    const entry = returnOf(orderId);
    const route = order && routeOf(order);
    if (!order || !entry || !route || order.status !== "待复核") return null;

    const before = snapshotOf(entry, route.budgetAmount, order.status);
    entry.startMileageKm = payload.startMileageKm;
    entry.endMileageKm = payload.endMileageKm;
    entry.receipts = payload.receipts.map((receipt) => ({ ...receipt, id: crypto.randomUUID() }));
    entry.note = payload.note;
    entry.updatedAt = new Date().toISOString();

    const verdict = evaluateReturn(route, entry);
    order.status = verdict.outcome;

    const revision: Revision = {
      id: crypto.randomUUID(),
      orderId,
      returnId: entry.id,
      reason,
      before,
      after: snapshotOf(entry, route.budgetAmount, verdict.outcome),
      createdAt: new Date().toISOString()
    };
    state.value.revisions.unshift(revision);
    return verdict;
  }

  function snapshotOf(
    entry: ReturnEntry,
    budgetAmount: number,
    outcome: DispatchOrder["status"]
  ): ReturnSnapshot {
    return {
      startMileageKm: entry.startMileageKm,
      endMileageKm: entry.endMileageKm,
      receipts: entry.receipts.map((receipt) => ({ ...receipt })),
      actualAmount: evaluateReturnAmount(entry),
      budgetAmount,
      outcome
    };
  }

  function evaluateReturnAmount(entry: ReturnEntry): number {
    return entry.receipts.reduce((acc, receipt) => acc + receipt.amount, 0);
  }

  return {
    routes,
    orders,
    returns,
    revisions,
    routeOf,
    returnOf,
    revisionsOf,
    releaseVerdict,
    reconcileVerdict,
    registerOrder,
    releaseOrder,
    submitReturn,
    supplementReturn
  };
});
