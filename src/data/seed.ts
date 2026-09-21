import type { DispatchOrder, RouteProfile } from "../domain/types";

export const TIME_SLOTS = ["06:00-10:00", "10:00-14:00", "14:00-18:00", "18:00-22:00"] as const;

export const RECEIPT_KINDS = ["桥费", "油费", "住宿", "其他"] as const;

export const seedRoutes: RouteProfile[] = [
  {
    id: "route-huhang",
    name: "沪杭干线",
    origin: "上海",
    destination: "杭州",
    minMileageKm: 176,
    bridgeFeeCap: 120,
    depositDue: 500,
    budgetAmount: 1500
  },
  {
    id: "route-huning",
    name: "沪宁快线",
    origin: "上海",
    destination: "南京",
    minMileageKm: 298,
    bridgeFeeCap: 180,
    depositDue: 800,
    budgetAmount: 2400
  },
  {
    id: "route-huyong",
    name: "沪甬短途",
    origin: "上海",
    destination: "宁波",
    minMileageKm: 220,
    bridgeFeeCap: 150,
    depositDue: 600,
    budgetAmount: 1800
  }
];

export const seedOrders: DispatchOrder[] = [
  {
    id: "order-seed-1",
    routeId: "route-huhang",
    plate: "沪A-82L6",
    driver: "董飞",
    timeSlot: "06:00-10:00",
    estimatedMileageKm: 182,
    bridgeFeeLimit: 110,
    depositAmount: 500,
    depositPaid: true,
    status: "已放行",
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    releasedAt: new Date(Date.now() - 80000000).toISOString()
  },
  {
    id: "order-seed-2",
    routeId: "route-huning",
    plate: "沪B-73K9",
    driver: "周航",
    timeSlot: "10:00-14:00",
    estimatedMileageKm: 305,
    bridgeFeeLimit: 175,
    depositAmount: 800,
    depositPaid: true,
    status: "待放行",
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    releasedAt: null
  }
];
