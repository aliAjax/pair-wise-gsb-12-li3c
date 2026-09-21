import type { DispatchOrder, RouteProfile } from "./types";

export type ReleaseViolationCode =
  | "MILEAGE_BELOW_MIN"
  | "BRIDGE_FEE_OVER_CAP"
  | "DEPOSIT_UNPAID";

export interface ReleaseViolation {
  code: ReleaseViolationCode;
  /** 触发条件 */
  label: string;
  /** 差额 */
  diff: number;
  unit: "km" | "元";
  detail: string;
}

export interface ReleaseVerdict {
  pass: boolean;
  violations: ReleaseViolation[];
}

/**
 * 放行判定(纯函数):
 * - 预计里程低于路线历史最低值 → 拦截,差额为不足里程
 * - 登记桥费上限超出路线封顶 → 拦截,差额为超出金额
 * - 押金未缴或未缴足 → 拦截,差额为欠缴金额
 */
export function evaluateRelease(
  order: Pick<
    DispatchOrder,
    "estimatedMileageKm" | "bridgeFeeLimit" | "depositAmount" | "depositPaid"
  >,
  route: RouteProfile
): ReleaseVerdict {
  const violations: ReleaseViolation[] = [];

  if (order.estimatedMileageKm < route.minMileageKm) {
    const diff = round2(route.minMileageKm - order.estimatedMileageKm);
    violations.push({
      code: "MILEAGE_BELOW_MIN",
      label: "预计里程低于路线历史最低值",
      diff,
      unit: "km",
      detail: `预计 ${order.estimatedMileageKm} km,低于历史最低 ${route.minMileageKm} km,差 ${diff} km`
    });
  }

  if (order.bridgeFeeLimit > route.bridgeFeeCap) {
    const diff = round2(order.bridgeFeeLimit - route.bridgeFeeCap);
    violations.push({
      code: "BRIDGE_FEE_OVER_CAP",
      label: "桥费上限超出路线封顶",
      diff,
      unit: "元",
      detail: `登记上限 ${order.bridgeFeeLimit} 元,超出路线封顶 ${route.bridgeFeeCap} 元,超 ${diff} 元`
    });
  }

  if (!order.depositPaid) {
    violations.push({
      code: "DEPOSIT_UNPAID",
      label: "押金未缴",
      diff: route.depositDue,
      unit: "元",
      detail: `应缴押金 ${route.depositDue} 元尚未缴纳`
    });
  } else if (order.depositAmount < route.depositDue) {
    const diff = round2(route.depositDue - order.depositAmount);
    violations.push({
      code: "DEPOSIT_UNPAID",
      label: "押金未缴足",
      diff,
      unit: "元",
      detail: `已缴 ${order.depositAmount} 元,应缴 ${route.depositDue} 元,欠 ${diff} 元`
    });
  }

  return { pass: violations.length === 0, violations };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
