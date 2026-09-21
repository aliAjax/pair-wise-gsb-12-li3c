import type { Receipt, RouteProfile } from "./types";

/** 实付超预算一成(10%)即转待复核 */
export const OVER_BUDGET_RATIO = 0.1;

export type ReviewTriggerCode = "OVER_BUDGET" | "RECEIPT_MISSING";

export interface ReviewTrigger {
  code: ReviewTriggerCode;
  /** 触发条件 */
  label: string;
  /** 差额(超预算为超出金额,票据缺失为无票金额) */
  diff: number;
  detail: string;
}

export interface ReconcileVerdict {
  actualAmount: number;
  budgetAmount: number;
  /** 预算上浮一成的放行线 */
  budgetLimit: number;
  triggers: ReviewTrigger[];
  outcome: "已核销" | "待复核";
}

export function sumReceipts(receipts: readonly Receipt[]): number {
  return round2(receipts.reduce((acc, receipt) => acc + (Number(receipt.amount) || 0), 0));
}

/**
 * 回场核销判定(纯函数):
 * - 实付(票据合计)超预算一成 → 待复核,差额为超出预算的金额
 * - 票据缺失(无票据或票据合计为零) → 待复核
 */
export function evaluateReturn(
  route: RouteProfile,
  entry: { receipts: readonly Receipt[] }
): ReconcileVerdict {
  const actualAmount = sumReceipts(entry.receipts);
  const budgetAmount = route.budgetAmount;
  const budgetLimit = round2(budgetAmount * (1 + OVER_BUDGET_RATIO));
  const triggers: ReviewTrigger[] = [];

  if (actualAmount > budgetLimit) {
    const diff = round2(actualAmount - budgetAmount);
    triggers.push({
      code: "OVER_BUDGET",
      label: "实付超预算一成",
      diff,
      detail: `实付 ${actualAmount} 元,预算 ${budgetAmount} 元(一成线 ${budgetLimit} 元),超 ${diff} 元`
    });
  }

  if (entry.receipts.length === 0 || actualAmount <= 0) {
    triggers.push({
      code: "RECEIPT_MISSING",
      label: "票据缺失",
      diff: 0,
      detail: "未登记任何有效票据,需补录票据并说明原因"
    });
  }

  return {
    actualAmount,
    budgetAmount,
    budgetLimit,
    triggers,
    outcome: triggers.length === 0 ? "已核销" : "待复核"
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
