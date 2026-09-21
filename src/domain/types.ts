/** 路线档案:派车单的校验基准(历史最低里程、桥费封顶、应缴押金、单趟预算) */
export interface RouteProfile {
  id: string;
  name: string;
  origin: string;
  destination: string;
  /** 历史最低里程(km),预计里程不得低于该值 */
  minMileageKm: number;
  /** 桥费封顶(元),登记的桥费上限不得超出 */
  bridgeFeeCap: number;
  /** 每趟应缴押金(元) */
  depositDue: number;
  /** 单趟预算(元),实付超预算一成转待复核 */
  budgetAmount: number;
}

export type OrderStatus = "待放行" | "已放行" | "待复核" | "已核销";

/** 派车单 */
export interface DispatchOrder {
  id: string;
  routeId: string;
  plate: string;
  driver: string;
  /** 时段,如 "06:00-10:00" */
  timeSlot: string;
  estimatedMileageKm: number;
  bridgeFeeLimit: number;
  depositAmount: number;
  depositPaid: boolean;
  status: OrderStatus;
  createdAt: string;
  releasedAt: string | null;
}

/** 票据 */
export interface Receipt {
  id: string;
  kind: string;
  amount: number;
}

/** 回场录入(一单一条,补录时原地更新并生成修订) */
export interface ReturnEntry {
  id: string;
  orderId: string;
  startMileageKm: number;
  endMileageKm: number;
  receipts: Receipt[];
  note: string;
  createdAt: string;
  updatedAt: string;
}

/** 修订前后的回场快照,保留原预算与原始录入可查 */
export interface ReturnSnapshot {
  startMileageKm: number;
  endMileageKm: number;
  receipts: Receipt[];
  actualAmount: number;
  budgetAmount: number;
  outcome: OrderStatus;
}

/** 补录修订 */
export interface Revision {
  id: string;
  orderId: string;
  returnId: string;
  reason: string;
  before: ReturnSnapshot;
  after: ReturnSnapshot;
  createdAt: string;
}
