<script setup lang="ts">
// 页面层组件：派车单登记 + 放行闸口实时预览（只负责交互与展示）
import { computed, reactive, ref } from "vue";
import { useDispatchStore } from "../store";
import { evaluateGate, gatePassed, yuan } from "../rules";
import type { GateItem } from "../types";

const store = useDispatchStore();

const today = new Date().toISOString().slice(0, 10);

const form = reactive({
  route: store.routes[0]?.route ?? "",
  vehicle: "",
  driver: "",
  date: today,
  startTime: "08:00",
  endTime: "17:00",
  estimatedKm: 100,
  tollCap: 50,
  depositRequired: 500,
  depositPaid: 500
});

const result = ref<{ released: boolean; code: string; blocked: string[] } | null>(null);

const gate = computed<GateItem[]>(() =>
  evaluateGate({
    route: form.route,
    estimatedKm: Number(form.estimatedKm) || 0,
    tollCap: Number(form.tollCap) || 0,
    depositRequired: Number(form.depositRequired) || 0,
    depositPaid: Number(form.depositPaid) || 0,
    routes: store.routes
  })
);

const passed = computed(() => gatePassed(gate.value));
const budgetPreview = computed(() => {
  const km = Number(form.estimatedKm) || 0;
  const toll = Number(form.tollCap) || 0;
  return { fuel: km * 2, toll, total: km * 2 + toll, cap: (km * 2 + toll) * 1.1 };
});

function submit() {
  const res = store.registerOrder({
    route: form.route.trim(),
    vehicle: form.vehicle.trim(),
    driver: form.driver.trim(),
    date: form.date,
    startTime: form.startTime,
    endTime: form.endTime,
    estimatedKm: Number(form.estimatedKm) || 0,
    tollCap: Number(form.tollCap) || 0,
    depositRequired: Number(form.depositRequired) || 0,
    depositPaid: Number(form.depositPaid) || 0
  });
  const order = store.orders.find((item) => item.id === res.id);
  result.value = { ...res, code: order?.code ?? "" };
  form.vehicle = "";
  form.driver = "";
}
</script>

<template>
  <form class="panel" @submit.prevent="submit">
    <h2>派车单登记</h2>
    <div class="form-grid">
      <label>
        路线
        <input v-model="form.route" list="route-options" placeholder="选择或输入路线" required />
        <datalist id="route-options">
          <option v-for="r in store.routes" :key="r.route" :value="r.route" />
        </datalist>
      </label>
      <label>车牌号<input v-model="form.vehicle" placeholder="如 沪A-82L6" required /></label>
      <label>司机<input v-model="form.driver" placeholder="司机姓名" required /></label>
      <label>日期<input v-model="form.date" type="date" required /></label>
      <label>出发时间<input v-model="form.startTime" type="time" required /></label>
      <label>返回时间<input v-model="form.endTime" type="time" required /></label>
      <label>预计里程（km）<input v-model.number="form.estimatedKm" type="number" min="0" step="1" required /></label>
      <label>桥费上限（元）<input v-model.number="form.tollCap" type="number" min="0" step="5" required /></label>
      <label>应缴押金（元）<input v-model.number="form.depositRequired" type="number" min="0" step="50" required /></label>
      <label>实缴押金（元）<input v-model.number="form.depositPaid" type="number" min="0" step="50" required /></label>
    </div>

    <div class="budget-preview">
      <span>油费预算 {{ yuan(budgetPreview.fuel) }}</span>
      <span>桥费预算 {{ yuan(budgetPreview.toll) }}</span>
      <span>预算合计 {{ yuan(budgetPreview.total) }}</span>
      <span>核销线（+10%）{{ yuan(budgetPreview.cap) }}</span>
    </div>

    <div class="gate-list">
      <p class="gate-title">放行闸口预检</p>
      <div v-for="item in gate" :key="item.key" class="gate-item" :class="item.passed ? 'ok' : 'block'">
        <div class="gate-head">
          <strong>{{ item.passed ? "✓" : "✕" }} {{ item.label }}</strong>
          <span>{{ item.passed ? "通过" : "不得放行" }}</span>
        </div>
        <p class="gate-trigger">触发条件：{{ item.trigger }}</p>
        <p class="gate-diff">差额：{{ item.difference }}</p>
      </div>
    </div>

    <button type="submit" class="wide">{{ passed ? "登记并放行" : "登记（闸口未过，转待放行）" }}</button>

    <div v-if="result" :class="['submit-result', result.released ? 'ok' : 'block']">
      <p v-if="result.released">派车单 {{ result.code }} 已放行，等待回场核销。</p>
      <template v-else>
        <p>派车单 {{ result.code }} 已登记，但未放行，触发条件：</p>
        <ul>
          <li v-for="(line, i) in result.blocked" :key="i">{{ line }}</li>
        </ul>
      </template>
      <button type="button" class="secondary" @click="result = null">知道了</button>
    </div>
  </form>
</template>
