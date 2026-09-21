<script setup lang="ts">
import { computed, ref } from "vue";
import { useReconciliationStore } from "./stores/reconciliation";
import DispatchView from "./views/DispatchView.vue";
import ReconcileView from "./views/ReconcileView.vue";

const store = useReconciliationStore();
const tab = ref<"dispatch" | "reconcile">("dispatch");

const metrics = computed(() => [
  { label: "待放行", value: store.orders.filter((order) => order.status === "待放行").length },
  { label: "在途(已放行)", value: store.orders.filter((order) => order.status === "已放行").length },
  { label: "待复核", value: store.orders.filter((order) => order.status === "待复核").length },
  { label: "已核销", value: store.orders.filter((order) => order.status === "已核销").length }
]);
</script>

<template>
  <main class="app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">物流行业前端最小闭环</p>
          <h1>路线费用核销台</h1>
          <p class="subtitle">
            派车单登记路线、车牌、司机、时段、预计里程、桥费上限与押金;预计里程低于路线历史最低值、
            桥费超限或押金未缴时不得放行。回场录入起止里程与票据金额,实付超预算一成或票据缺失转待复核,
            补录写原因并生成修订,原预算可查。
          </p>
        </div>
        <nav class="tabs">
          <button :class="{ active: tab === 'dispatch' }" @click="tab = 'dispatch'">派车登记</button>
          <button :class="{ active: tab === 'reconcile' }" @click="tab = 'reconcile'">回场核销</button>
        </nav>
      </header>

      <section class="metrics">
        <article v-for="metric in metrics" :key="metric.label" class="metric">
          <span>{{ metric.label }}</span>
          <strong>{{ metric.value }}</strong>
        </article>
      </section>

      <DispatchView v-if="tab === 'dispatch'" />
      <ReconcileView v-else />
    </div>
  </main>
</template>
