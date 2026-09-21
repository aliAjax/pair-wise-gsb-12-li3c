<script setup lang="ts">
// 页面装配层：只负责布局、筛选与指标展示；数据走 store，判定走 rules
import { computed, ref } from "vue";
import { useDispatchStore } from "./store";
import { yuan } from "./rules";
import DispatchForm from "./components/DispatchForm.vue";
import OrderCard from "./components/OrderCard.vue";

const store = useDispatchStore();

const filters = ["全部", "待放行", "待回场", "待复核", "已核销"] as const;
const filter = ref<(typeof filters)[number]>("全部");
const routeKeyword = ref("");

const filteredOrders = computed(() => {
  let list = store.orders;
  if (filter.value !== "全部") list = list.filter((order) => order.status === filter.value);
  const keyword = routeKeyword.value.trim();
  if (keyword) {
    list = list.filter(
      (order) =>
        order.route.includes(keyword) ||
        order.vehicle.includes(keyword) ||
        order.driver.includes(keyword) ||
        order.code.includes(keyword)
    );
  }
  return list;
});

const statusCounts = computed(() =>
  ["待放行", "待回场", "待复核", "已核销"].map((status) => ({
    status,
    value: store.orders.filter((order) => order.status === status).length
  }))
);
const maxCount = computed(() => Math.max(1, ...statusCounts.value.map((row) => row.value)));

const metricCards = computed(() => [
  { label: "派车单总数", value: String(store.metrics.total) },
  { label: "待放行", value: String(store.metrics.waitingRelease) },
  { label: "待回场", value: String(store.metrics.waitingReturn) },
  { label: "待复核", value: String(store.metrics.reviewing) },
  { label: "已核销", value: String(store.metrics.settled) },
  { label: "已实付合计", value: yuan(store.metrics.paidSum) }
]);
</script>

<template>
  <main class="app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">物流行业 · 费用核销最小闭环</p>
          <h1>路线费用核销台</h1>
          <p class="subtitle">
            登记派车单并校验里程、桥费与押金闸口；回场录入起止里程与票据，超预算一成或票据缺失转待复核，补录写原因并生成修订，原预算快照可查。
          </p>
        </div>
        <div class="stack">
          <span class="tag">Vue3</span>
          <span class="tag">Pinia</span>
          <span class="tag">TypeScript</span>
          <span class="tag">localStorage</span>
        </div>
      </header>

      <section class="metrics metrics-6">
        <article v-for="card in metricCards" :key="card.label" class="metric">
          <span>{{ card.label }}</span>
          <strong>{{ card.value }}</strong>
        </article>
      </section>

      <section class="workspace workspace-wide">
        <DispatchForm />

        <section class="list-panel">
          <div class="toolbar">
            <h2>派车单列表</h2>
            <div class="toolbar-controls">
              <input v-model="routeKeyword" class="search" placeholder="搜索路线 / 车牌 / 司机 / 单号" />
              <select v-model="filter">
                <option v-for="item in filters" :key="item" :value="item">{{ item }}</option>
              </select>
            </div>
          </div>

          <section class="route-stats">
            <h3>路线里程基准（回场后自动更新）</h3>
            <div class="stat-chips">
              <span v-for="route in store.routes" :key="route.route" class="chip">
                {{ route.route }}：最低 {{ route.minKm }}km · {{ route.tripCount }}趟
              </span>
            </div>
          </section>

          <div class="record-grid">
            <div v-if="filteredOrders.length === 0" class="empty">暂无匹配单据</div>
            <OrderCard v-for="order in filteredOrders" :key="order.id" :order="order" />
          </div>

          <div class="mini-chart">
            <div v-for="row in statusCounts" :key="row.status" class="bar">
              <span>{{ row.status }}</span>
              <div class="bar-track"><div class="bar-fill" :style="{ width: `${(row.value / maxCount) * 100}%` }" /></div>
              <strong>{{ row.value }}</strong>
            </div>
          </div>
        </section>
      </section>
    </div>
  </main>
</template>
