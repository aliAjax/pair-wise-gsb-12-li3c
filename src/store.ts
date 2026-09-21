// 数据层：Pinia store + localStorage 持久化
// 任务(orders)、预算(orders[].budget 快照)、票据(returnRecord.receipts)、修订(revisions)
// 分键存储，互不覆盖；预算以快照形式保留，回场补录不改原预算，只追加修订。

import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { DispatchOrder, PersistState, Receipt, Revision, RouteStat } from "./types";
import { buildBudget, buildReturn, evaluateGate, evaluateReturn, gatePassed, receiptTotal, round2 } from "./rules";

const STATE_KEY = "dfwlfront-3-reimburse-orders-v1";

interface SeedRoute {
  route: string;
  minKm: number;
  tripCount: number;
}

const seedRoutes: SeedRoute[] = [
  { route: "上海-苏州", minKm: 96, tripCount: 12 },
  { route: "上海-昆山", minKm: 52, tripCount: 7 },
  { route: "上海-南通", minKm: 118, tripCount: 5 }
];

interface SeedOrder {
  code: string;
  route: string;
  vehicle: string;
  driver: string;
  date: string;
  startTime: string;
  endTime: string;
  estimatedKm: number;
  tollCap: number;
  depositRequired: number;
  depositPaid: number;
  status: DispatchOrder["status"];
  daysAgo: number;
}

const seedOrders: SeedOrder[] = [
  {
    code: "PC-20260918-01",
    route: "上海-苏州",
    vehicle: "沪A-82L6",
    driver: "董飞",
    date: "2026-09-18",
    startTime: "08:00",
    endTime: "14:30",
    estimatedKm: 100,
    tollCap: 60,
    depositRequired: 500,
    depositPaid: 500,
    status: "已核销",
    daysAgo: 3
  },
  {
    code: "PC-20260919-02",
    route: "上海-昆山",
    vehicle: "沪B-73K9",
    driver: "周航",
    date: "2026-09-20",
    startTime: "09:00",
    endTime: "16:00",
    estimatedKm: 55,
    tollCap: 40,
    depositRequired: 300,
    depositPaid: 300,
    status: "待回场",
    daysAgo: 1
  }
];

function seedData(): PersistState {
  const routes: RouteStat[] = seedRoutes.map((item) => ({ ...item }));
  const now = Date.now();
  const orders: DispatchOrder[] = seedOrders.map((seed, index) => {
    const createdAt = new Date(now - seed.daysAgo * 86400000 - index * 3600000).toISOString();
    const order: DispatchOrder = {
      id: `seed-${index + 1}`,
      code: seed.code,
      route: seed.route,
      vehicle: seed.vehicle,
      driver: seed.driver,
      date: seed.date,
      startTime: seed.startTime,
      endTime: seed.endTime,
      budget: buildBudget(seed.estimatedKm, seed.tollCap, seed.depositRequired),
      depositPaid: seed.depositPaid,
      status: seed.status,
      createdAt,
      releasedAt: createdAt,
      revisions: []
    };
    if (seed.status === "已核销") {
      order.returnRecord = {
        startKm: 12050,
        endKm: 12152,
        actualKm: 102,
        receipts: [
          { id: "seed-r1", type: "油费", amount: 200 },
          { id: "seed-r2", type: "桥费", amount: 55 }
        ],
        paidTotal: 255,
        recordedAt: new Date(now - seed.daysAgo * 86400000 + 6 * 3600000).toISOString()
      };
    }
    return order;
  });
  return { orders, routes };
}

function load(): PersistState {
  const raw = localStorage.getItem(STATE_KEY);
  if (!raw) return seedData();
  try {
    const parsed = JSON.parse(raw) as PersistState;
    if (!Array.isArray(parsed.orders) || !Array.isArray(parsed.routes)) return seedData();
    return parsed;
  } catch {
    return seedData();
  }
}

export interface NewOrderInput {
  route: string;
  vehicle: string;
  driver: string;
  date: string;
  startTime: string;
  endTime: string;
  estimatedKm: number;
  tollCap: number;
  depositRequired: number;
  depositPaid: number;
}

export interface ReturnInput {
  startKm: number;
  endKm: number;
  receipts: Receipt[];
}

export const useDispatchStore = defineStore("reimburse", () => {
  const initial = load();
  const orders = ref<DispatchOrder[]>(initial.orders);
  const routes = ref<RouteStat[]>(initial.routes);

  function persist() {
    const state: PersistState = { orders: orders.value, routes: routes.value };
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  }

  function nextCode(): string {
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const count = orders.value.filter((order) => order.code.includes(day)).length + 1;
    return `PC-${day}-${String(count).padStart(2, "0")}`;
  }

  /** 预演放行判定（页面用于显示差额与触发条件） */
  function previewGate(input: NewOrderInput) {
    return evaluateGate({
      route: input.route,
      estimatedKm: input.estimatedKm,
      tollCap: input.tollCap,
      depositRequired: input.depositRequired,
      depositPaid: input.depositPaid,
      routes: routes.value
    });
  }

  /** 登记派车单：闸口不过则只登记不放行（待放行），并返回阻断项；通过则放行 */
  function registerOrder(input: NewOrderInput): { id: string; released: boolean; blocked: string[] } {
    const gate = previewGate(input);
    const released = gatePassed(gate);
    const nowIso = new Date().toISOString();
    const order: DispatchOrder = {
      id: crypto.randomUUID(),
      code: nextCode(),
      route: input.route,
      vehicle: input.vehicle,
      driver: input.driver,
      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      budget: buildBudget(input.estimatedKm, input.tollCap, input.depositRequired),
      depositPaid: input.depositPaid,
      status: released ? "待回场" : "待放行",
      createdAt: nowIso,
      releasedAt: released ? nowIso : undefined,
      revisions: []
    };
    orders.value = [order, ...orders.value];
    persist();
    return {
      id: order.id,
      released,
      blocked: gate.filter((item) => !item.passed).map((item) => `${item.label}：${item.trigger}（${item.difference}）`)
    };
  }

  /** 待放行单补正后再次申请放行 */
  function reattemptRelease(id: string, depositPaid: number, estimatedKm: number, tollCap: number): { released: boolean; blocked: string[] } {
    const order = orders.value.find((item) => item.id === id);
    if (!order || order.status !== "待放行") return { released: false, blocked: ["单据状态不允许放行"] };
    const gate = evaluateGate({
      route: order.route,
      estimatedKm,
      tollCap,
      depositRequired: order.budget.depositRequired,
      depositPaid,
      routes: routes.value
    });
    if (!gatePassed(gate)) {
      return {
        released: false,
        blocked: gate.filter((item) => !item.passed).map((item) => `${item.label}：${item.trigger}（${item.difference}）`)
      };
    }
    // 预算快照以补正后的口径重建（尚未回场，原预算未发生核销，可更新）
    order.budget = buildBudget(estimatedKm, tollCap, order.budget.depositRequired);
    order.depositPaid = depositPaid;
    order.status = "待回场";
    order.releasedAt = new Date().toISOString();
    persist();
    return { released: true, blocked: [] };
  }

  /** 回场录入：判定后进入 已核销 或 待复核 */
  function recordReturn(id: string, input: ReturnInput) {
    const order = orders.value.find((item) => item.id === id);
    if (!order || !["待回场", "待复核"].includes(order.status)) return;
    const verdict = evaluateReturn(order, input);
    order.returnRecord = buildReturn(input);
    order.status = verdict.status;
    // 放行后实际回场，更新路线历史最低里程
    upsertRouteStat(order.route, verdict.actualKm);
    persist();
  }

  function upsertRouteStat(route: string, actualKm: number) {
    if (actualKm <= 0) return;
    const stat = routes.value.find((item) => item.route === route);
    if (stat) {
      stat.minKm = Math.min(stat.minKm, actualKm);
      stat.tripCount += 1;
    } else {
      routes.value.push({ route, minKm: actualKm, tripCount: 1 });
    }
  }

  /** 待复核单补录：写原因并生成修订，原预算快照保持可查 */
  function supplement(id: string, input: ReturnInput, reason: string): boolean {
    const order = orders.value.find((item) => item.id === id);
    if (!order || order.status !== "待复核" || !reason.trim()) return false;
    const before = order.returnRecord;
    const verdict = evaluateReturn(order, input);
    const revision: Revision = {
      id: crypto.randomUUID(),
      reason: reason.trim(),
      oldPaid: before?.paidTotal ?? 0,
      newPaid: receiptTotal(input.receipts),
      receiptCountBefore: before?.receipts.length ?? 0,
      receiptCountAfter: input.receipts.length,
      createdAt: new Date().toISOString()
    };
    order.returnRecord = buildReturn(input);
    order.revisions.push(revision);
    // 补录后仍超标可继续留待复核；数据合规则核销
    order.status = verdict.status;
    persist();
    return true;
  }

  function remove(id: string) {
    orders.value = orders.value.filter((item) => item.id !== id);
    persist();
  }

  // 页面指标
  const metrics = computed(() => {
    const list = orders.value;
    return {
      total: list.length,
      waitingRelease: list.filter((o) => o.status === "待放行").length,
      waitingReturn: list.filter((o) => o.status === "待回场").length,
      reviewing: list.filter((o) => o.status === "待复核").length,
      settled: list.filter((o) => o.status === "已核销").length,
      paidSum: round2(list.reduce((sum, o) => sum + (o.returnRecord?.paidTotal ?? 0), 0))
    };
  });

  return {
    orders,
    routes,
    metrics,
    persist,
    previewGate,
    registerOrder,
    reattemptRelease,
    recordReturn,
    supplement,
    remove
  };
});
