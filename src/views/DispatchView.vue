<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { useReconciliationStore } from "../stores/reconciliation";
import { evaluateRelease } from "../domain/release";
import { TIME_SLOTS } from "../data/seed";
import { formatTime, formatYuan } from "../lib/format";

const store = useReconciliationStore();

const blank = () => ({
  routeId: "",
  plate: "",
  driver: "",
  timeSlot: TIME_SLOTS[0] as string,
  estimatedMileageKm: 0,
  bridgeFeeLimit: 0,
  depositAmount: 0,
  depositPaid: false
});

const form = reactive(blank());
const lastBlocked = ref<string[]>([]);

const selectedRoute = computed(() =>
  store.routes.find((route) => route.id === form.routeId)
);

/** 表单实时预检:填写过程中即显示差额与触发条件 */
const preview = computed(() => {
  if (!selectedRoute.value) return null;
  return evaluateRelease(form, selectedRoute.value);
});

const sortedOrders = computed(() =>
  [...store.orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
);

function routeName(routeId: string) {
  return store.routes.find((route) => route.id === routeId)?.name ?? "未知路线";
}

function applyRouteDefaults() {
  const route = selectedRoute.value;
  if (!route) return;
  form.estimatedMileageKm = route.minMileageKm;
  form.bridgeFeeLimit = route.bridgeFeeCap;
  form.depositAmount = route.depositDue;
}

function submit() {
  if (!selectedRoute.value) return;
  store.registerOrder({ ...form });
  Object.assign(form, blank());
}

function release(orderId: string) {
  const verdict = store.releaseOrder(orderId);
  if (verdict && !verdict.pass) {
    lastBlocked.value = verdict.violations.map((item) => item.detail);
  } else {
    lastBlocked.value = [];
  }
}
</script>

<template>
  <section class="workspace">
    <form class="panel" @submit.prevent="submit">
      <h2>派车单登记</h2>
      <div class="form-grid">
        <label>
          路线
          <select v-model="form.routeId" required @change="applyRouteDefaults">
            <option value="">请选择路线</option>
            <option v-for="route in store.routes" :key="route.id" :value="route.id">
              {{ route.name }}({{ route.origin }} → {{ route.destination }})
            </option>
          </select>
        </label>

        <div v-if="selectedRoute" class="route-facts">
          <span>历史最低里程 {{ selectedRoute.minMileageKm }} km</span>
          <span>桥费封顶 {{ formatYuan(selectedRoute.bridgeFeeCap) }}</span>
          <span>应缴押金 {{ formatYuan(selectedRoute.depositDue) }}</span>
          <span>单趟预算 {{ formatYuan(selectedRoute.budgetAmount) }}</span>
        </div>

        <label>车牌号<input v-model="form.plate" required placeholder="如 沪A-82L6" /></label>
        <label>司机<input v-model="form.driver" required placeholder="司机姓名" /></label>
        <label>
          时段
          <select v-model="form.timeSlot" required>
            <option v-for="slot in TIME_SLOTS" :key="slot" :value="slot">{{ slot }}</option>
          </select>
        </label>
        <label>
          预计里程(km)
          <input v-model.number="form.estimatedMileageKm" type="number" min="0" step="0.1" required />
        </label>
        <label>
          桥费上限(元)
          <input v-model.number="form.bridgeFeeLimit" type="number" min="0" step="1" required />
        </label>
        <label>
          押金(元)
          <input v-model.number="form.depositAmount" type="number" min="0" step="1" required />
        </label>
        <label class="check">
          <input v-model="form.depositPaid" type="checkbox" />
          押金已缴
        </label>

        <div v-if="preview && !preview.pass" class="violations">
          <p class="violations-title">当前登记不满足放行条件:</p>
          <ul>
            <li v-for="item in preview.violations" :key="item.code + item.detail">
              <strong>{{ item.label }}</strong>,差额 {{ item.diff }} {{ item.unit }} —— {{ item.detail }}
            </li>
          </ul>
        </div>

        <button type="submit" :disabled="!selectedRoute">登记派车单</button>
      </div>
    </form>

    <section class="list-panel">
      <div class="toolbar">
        <h2>派车单列表</h2>
        <span v-if="lastBlocked.length" class="blocked-tip">放行被拦截:{{ lastBlocked.join(";") }}</span>
      </div>

      <div class="record-grid">
        <div v-if="sortedOrders.length === 0" class="empty">暂无派车单</div>
        <article v-for="order in sortedOrders" :key="order.id" class="record">
          <div class="record-head">
            <p class="record-title">{{ order.plate }} / {{ order.driver }}</p>
            <span class="status" :data-status="order.status">{{ order.status }}</span>
          </div>
          <div class="details">
            <span>路线: {{ routeName(order.routeId) }}</span>
            <span>时段: {{ order.timeSlot }}</span>
            <span>预计里程: {{ order.estimatedMileageKm }} km</span>
            <span>桥费上限: {{ formatYuan(order.bridgeFeeLimit) }}</span>
            <span>押金: {{ formatYuan(order.depositAmount) }}({{ order.depositPaid ? "已缴" : "未缴" }})</span>
            <span>登记时间: {{ formatTime(order.createdAt) }}</span>
          </div>

          <template v-if="order.status === '待放行'">
            <div v-if="store.releaseVerdict(order) && !store.releaseVerdict(order)!.pass" class="violations">
              <p class="violations-title">不得放行,触发条件:</p>
              <ul>
                <li v-for="item in store.releaseVerdict(order)!.violations" :key="item.code + item.detail">
                  <strong>{{ item.label }}</strong>,差额 {{ item.diff }} {{ item.unit }} —— {{ item.detail }}
                </li>
              </ul>
            </div>
            <div class="actions">
              <button
                type="button"
                :disabled="!store.releaseVerdict(order)?.pass"
                @click="release(order.id)"
              >
                放行
              </button>
            </div>
          </template>
          <p v-else-if="order.releasedAt" class="note">放行时间:{{ formatTime(order.releasedAt) }}</p>
        </article>
      </div>
    </section>
  </section>
</template>
