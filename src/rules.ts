// 判定层：纯函数规则，不依赖 Vue 与 localStorage，可独立测试

import type { BudgetSnapshot, DispatchOrder, GateItem, Receipt, ReturnRecord, RouteStat } from "./types";

export const COST_PER_KM = 2; // 每公里油费基准（元）
export const OVER_RATIO = 0.1; // 实付超预算一成

export function yuan(value: number): string {
  return `¥${value.toFixed(2)}`;
}

export function buildBudget(estimatedKm: number, tollCap: number, depositRequired: number): BudgetSnapshot {
  const fuelBudget = round2(estimatedKm * COST_PER_KM);
  const tollBudget = tollCap;
  const total = round2(fuelBudget + tollBudget);
  return {
    estimatedKm,
    tollCap,
    depositRequired,
    costPerKm: COST_PER_KM,
    fuelBudget,
    tollBudget,
    total,
    capLine: round2(total * (1 + OVER_RATIO))
  };
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function routeMinKm(routes: RouteStat[], route: string): number | null {
  const stat = routes.find((item) => item.route === route);
  return stat && stat.tripCount > 0 ? stat.minKm : null;
}

/** 放行闸口：里程 / 桥费 / 押金，任何一条不通过都不得放行 */
export function evaluateGate(input: {
  route: string;
  estimatedKm: number;
  tollCap: number;
  depositRequired: number;
  depositPaid: number;
  routes: RouteStat[];
}): GateItem[] {
  const minKm = routeMinKm(input.routes, input.route);
  const items: GateItem[] = [];

  items.push({
    key: "mileage",
    label: "预计里程",
    passed: minKm === null || input.estimatedKm >= minKm,
    trigger: minKm === null
      ? `路线「${input.route}」无历史里程，首次登记不校验`
      : `预计里程 ${input.estimatedKm}km < 路线历史最低值 ${minKm}km`,
    difference: minKm === null
      ? "无历史基准"
      : input.estimatedKm >= minKm
        ? `高于底线 ${round2(input.estimatedKm - minKm)}km`
        : `差 ${round2(minKm - input.estimatedKm)}km（需补到 ${minKm}km）`
  });

  items.push({
    key: "toll",
    label: "桥费上限",
    passed: input.tollCap > 0,
    trigger:
      input.tollCap > 0
        ? `桥费上限已设置为 ${yuan(input.tollCap)}（>0，作为预算硬约束）`
        : "桥费上限未设置或为 0，无法作为超限校验基准",
    difference:
      input.tollCap > 0
        ? `桥费预算 ${yuan(input.tollCap)}，核销时票据不得超出`
        : `差 ${yuan(0 - input.tollCap)}，请填写大于 0 的桥费上限`
  });

  items.push({
    key: "deposit",
    label: "押金",
    passed: input.depositPaid >= input.depositRequired,
    trigger: `实缴押金 ${yuan(input.depositPaid)} ${input.depositPaid >= input.depositRequired ? "≥" : "<"} 应缴 ${yuan(input.depositRequired)}`,
    difference:
      input.depositPaid >= input.depositRequired
        ? `已缴清，余 ${yuan(input.depositPaid - input.depositRequired)}`
        : `欠缴 ${yuan(input.depositRequired - input.depositPaid)}`
  });

  return items;
}

export function gatePassed(items: GateItem[]): boolean {
  return items.every((item) => item.passed);
}

export function receiptTotal(receipts: Receipt[]): number {
  return round2(receipts.reduce((sum, receipt) => sum + receipt.amount, 0));
}

export function tollReceiptTotal(receipts: Receipt[]): number {
  return receiptTotal(receipts.filter((receipt) => receipt.type === "桥费"));
}

export interface ReturnVerdict {
  actualKm: number;
  validKm: boolean;
  paidTotal: number;
  receiptCount: number;
  receiptMissing: boolean;
  tollOverCap: boolean;
  overBudget: boolean;
  overAmount: number;
  reasons: string[]; // 转待复核的触发条件
  status: "待复核" | "已核销";
}

/** 回场判定：里程校验、票据缺失、桥费超限、实付超预算一成 → 待复核 */
export function evaluateReturn(order: DispatchOrder, input: {
  startKm: number;
  endKm: number;
  receipts: Receipt[];
}): ReturnVerdict {
  const actualKm = round2(input.endKm - input.startKm);
  const validKm = input.endKm > input.startKm && actualKm > 0;
  const paidTotal = receiptTotal(input.receipts);
  const receiptCount = input.receipts.length;
  const receiptMissing = receiptCount === 0;
  const toll = tollReceiptTotal(input.receipts);
  const tollOverCap = toll > order.budget.tollCap;
  const overAmount = round2(paidTotal - order.budget.capLine);
  const overBudget = overAmount > 0;

  const reasons: string[] = [];
  if (!validKm) reasons.push(`里程异常：止码 ${input.endKm}km ≤ 起码 ${input.startKm}km`);
  if (receiptMissing) reasons.push("票据缺失：未登记任何费用票据");
  if (tollOverCap) {
    reasons.push(`桥费超限：桥票合计 ${yuan(toll)} > 上限 ${yuan(order.budget.tollCap)}，超 ${yuan(toll - order.budget.tollCap)}`);
  }
  if (overBudget) {
    reasons.push(`实付超预算一成：${yuan(paidTotal)} > 核销线 ${yuan(order.budget.capLine)}（预算 ${yuan(order.budget.total)} × 1.1），超 ${yuan(overAmount)}`);
  }

  return {
    actualKm,
    validKm,
    paidTotal,
    receiptCount,
    receiptMissing,
    tollOverCap,
    overBudget,
    overAmount,
    reasons,
    status: reasons.length > 0 ? "待复核" : "已核销"
  };
}

export function buildReturn(input: {
  startKm: number;
  endKm: number;
  receipts: Receipt[];
}): ReturnRecord {
  return {
    startKm: input.startKm,
    endKm: input.endKm,
    actualKm: round2(input.endKm - input.startKm),
    receipts: input.receipts,
    paidTotal: receiptTotal(input.receipts),
    recordedAt: new Date().toISOString()
  };
}
