// 数据层模型：派车单、回场结算、票据、修订与路线基准，各自独立存储

export type OrderStatus = "待放行" | "待回场" | "待复核" | "已核销";

export type ReceiptType = "油费" | "桥费" | "其他";

export interface Receipt {
  id: string;
  type: ReceiptType;
  amount: number;
}

export interface BudgetSnapshot {
  estimatedKm: number;
  tollCap: number;
  depositRequired: number;
  costPerKm: number;
  fuelBudget: number;
  tollBudget: number;
  total: number;
  capLine: number; // 预算上限：总额 × 1.1
}

export interface ReturnRecord {
  startKm: number;
  endKm: number;
  actualKm: number;
  receipts: Receipt[];
  paidTotal: number;
  recordedAt: string;
}

export interface Revision {
  id: string;
  reason: string;
  oldPaid: number;
  newPaid: number;
  receiptCountBefore: number;
  receiptCountAfter: number;
  createdAt: string;
}

export interface DispatchOrder {
  id: string;
  code: string;
  route: string;
  vehicle: string;
  driver: string;
  date: string;
  startTime: string;
  endTime: string;
  budget: BudgetSnapshot;
  depositPaid: number;
  status: OrderStatus;
  createdAt: string;
  releasedAt?: string;
  returnRecord?: ReturnRecord;
  revisions: Revision[];
}

export interface RouteStat {
  route: string;
  minKm: number;
  tripCount: number;
}

export interface PersistState {
  orders: DispatchOrder[];
  routes: RouteStat[];
}

export interface GateItem {
  key: "mileage" | "toll" | "deposit";
  label: string;
  passed: boolean;
  trigger: string; // 触发条件描述
  difference: string; // 差额描述
}
