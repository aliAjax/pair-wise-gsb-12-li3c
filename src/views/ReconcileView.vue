<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { useReconciliationStore, type ReturnPayload } from "../stores/reconciliation";
import { evaluateReturn, OVER_BUDGET_RATIO, sumReceipts } from "../domain/reconcile";
import { RECEIPT_KINDS } from "../data/seed";
import { formatTime, formatYuan } from "../lib/format";
import type { DispatchOrder } from "../domain/types";

const store = useReconciliationStore();

type ReceiptDraft = { kind: string; amount: number };

const blankReturn = (): ReturnPayload & { receipts: ReceiptDraft[] } => ({
  startMileageKm: 0,
  endMileageKm: 0,
  receipts: [],
  note: ""
});

const selectedOrderId = ref("");
const returnForm = reactive(blankReturn());
const lastVerdict = ref<{ orderId: string; outcome: string; details: string[] } | null>(null);

const editingOrderId = ref("");
const supplementForm = reactive(blankReturn());
const supplementReason = ref("");

const releasedOrders = computed(() =>
  store.orders.filter((order) => order.status === "已放行")
);
const reviewOrders = computed(() =>
  store.orders.filter((order) => order.status === "待复核")
);
const closedOrders = computed(() =>
  store.orders.filter((order) => order.status === "已核销")
);

const selectedOrder = computed(() =>
  store.orders.find((order) => order.id === selectedOrderId.value)
);
const selectedRoute = computed(() =>
  selectedOrder.value ? store.routeOf(selectedOrder.value) : undefined
);

/** 录入实时预检:实付合计、一成线、是否触发复核 */
const returnPreview = computed(() => {
  if (!selectedRoute.value) return null;
  return evaluateReturn(selectedRoute.value, { receipts: returnForm.receipts });
});

function routeName(routeId: string) {
  return store.routes.find((route) => route.id === routeId)?.name ?? "未知路线";
}

function orderLabel(order: DispatchOrder) {
  return `${order.plate} / ${order.driver} / ${routeName(order.routeId)} / ${order.timeSlot}`;
}

function addReceipt(target: { receipts: ReceiptDraft[] }) {
  target.receipts.push({ kind: RECEIPT_KINDS[0] as string, amount: 0 });
}

function removeReceipt(target: { receipts: ReceiptDraft[] }, index: number) {
  target.receipts.splice(index, 1);
}

function submitReturn() {
  if (!selectedOrderId.value) return;
  const verdict = store.submitReturn(selectedOrderId.value, { ...returnForm });
  if (verdict) {
    lastVerdict.value = {
      orderId: selectedOrderId.value,
      outcome: verdict.outcome,
      details: verdict.triggers.map((item) => item.detail)
    };
  }
  Object.assign(returnForm, blankReturn());
  selectedOrderId.value = "";
}

function startSupplement(orderId: string) {
  const entry = store.returnOf(orderId);
  if (!entry) return;
  editingOrderId.value = orderId;
  supplementReason.value = "";
  Object.assign(supplementForm, {
    startMileageKm: entry.startMileageKm,
    endMileageKm: entry.endMileageKm,
    receipts: entry.receipts.map((receipt) => ({ kind: receipt.kind, amount: receipt.amount })),
    note: entry.note
  });
}

function submitSupplement(orderId: string) {
  if (!supplementReason.value.trim()) return;
  store.supplementReturn(orderId, { ...supplementForm }, supplementReason.value.trim());
  editingOrderId.value = "";
  supplementReason.value = "";
  Object.assign(supplementForm, blankReturn());
}

function actualOf(orderId: string) {
  const entry = store.returnOf(orderId);
  return entry ? sumReceipts(entry.receipts) : 0;
}

function triggersOf(orderId: string) {
  return store.reconcileVerdict(orderId)?.triggers ?? [];
}

function mileageOf(orderId: string) {
  const entry = store.returnOf(orderId);
  return entry ? entry.endMileageKm - entry.startMileageKm : 0;
}

const ratioText = `${OVER_BUDGET_RATIO * 100}%`;
</script>

<template>
  <section class="workspace">
    <form class="panel" @submit.prevent="submitReturn">
      <h2>回场录入</h2>
      <div class="form-grid">
        <label>
          回场派车单
          <select v-model="selectedOrderId" required>
            <option value="">请选择已放行派车单</option>
            <option v-for="order in releasedOrders" :key="order.id" :value="order.id">
              {{ orderLabel(order) }}
            </option>
          </select>
        </label>

        <div v-if="selectedRoute" class="route-facts">
          <span>单趟预算 {{ formatYuan(selectedRoute.budgetAmount) }}</span>
          <span>复核线(超{{ ratioText }}) {{ formatYuan(selectedRoute.budgetAmount * (1 + OVER_BUDGET_RATIO)) }}</span>
        </div>

        <label>
          起始里程(km)
          <input v-model.number="returnForm.startMileageKm" type="number" min="0" step="0.1" required />
        </label>
        <label>
          结束里程(km)
          <input v-model.number="returnForm.endMileageKm" type="number" min="0" step="0.1" required />
        </label>

        <div class="receipt-editor">
          <div class="receipt-head">
            <span>票据金额</span>
            <button type="button" class="secondary" @click="addReceipt(returnForm)">添加票据</button>
          </div>
          <div v-for="(receipt, index) in returnForm.receipts" :key="index" class="receipt-row">
            <select v-model="receipt.kind">
              <option v-for="kind in RECEIPT_KINDS" :key="kind" :value="kind">{{ kind }}</option>
            </select>
            <input v-model.number="receipt.amount" type="number" min="0" step="0.01" placeholder="金额(元)" />
            <button type="button" class="danger" @click="removeReceipt(returnForm, index)">移除</button>
          </div>
          <p v-if="returnForm.receipts.length === 0" class="hint">未添加票据,提交后将因票据缺失转待复核。</p>
        </div>

        <div v-if="returnPreview" class="verdict" :data-outcome="returnPreview.outcome">
          <p>
            实付合计 {{ formatYuan(returnPreview.actualAmount) }} / 预算
            {{ formatYuan(returnPreview.budgetAmount) }} → 判定:{{ returnPreview.outcome }}
          </p>
          <ul v-if="returnPreview.triggers.length">
            <li v-for="item in returnPreview.triggers" :key="item.code">{{ item.label }} —— {{ item.detail }}</li>
          </ul>
        </div>

        <label>
          备注
          <textarea v-model="returnForm.note" placeholder="回场情况说明" />
        </label>
        <button type="submit" :disabled="!selectedOrderId">提交回场录入</button>

        <p v-if="lastVerdict" class="hint">
          上一单判定:{{ lastVerdict.outcome }}
          <template v-if="lastVerdict.details.length">({{ lastVerdict.details.join(";") }})</template>
        </p>
      </div>
    </form>

    <section class="list-panel">
      <div class="toolbar"><h2>待复核({{ reviewOrders.length }})</h2></div>
      <div class="record-grid">
        <div v-if="reviewOrders.length === 0" class="empty">暂无待复核单据</div>
        <article v-for="order in reviewOrders" :key="order.id" class="record">
          <div class="record-head">
            <p class="record-title">{{ orderLabel(order) }}</p>
            <span class="status" data-status="待复核">待复核</span>
          </div>
          <div class="details">
            <span>实付: {{ formatYuan(actualOf(order.id)) }}</span>
            <span>预算: {{ formatYuan(store.routeOf(order)?.budgetAmount ?? 0) }}</span>
            <span>实际里程: {{ mileageOf(order.id) }} km</span>
            <span>票据: {{ store.returnOf(order.id)?.receipts.length ?? 0 }} 张</span>
          </div>
          <div class="violations">
            <p class="violations-title">触发条件:</p>
            <ul>
              <li v-for="item in triggersOf(order.id)" :key="item.code">
                <strong>{{ item.label }}</strong>
                <template v-if="item.diff > 0">,差额 {{ formatYuan(item.diff) }}</template>
                —— {{ item.detail }}
              </li>
            </ul>
          </div>

          <div v-if="editingOrderId !== order.id" class="actions">
            <button type="button" @click="startSupplement(order.id)">补录</button>
          </div>

          <form v-else class="supplement" @submit.prevent="submitSupplement(order.id)">
            <h3>补录(将生成修订,原预算与原始录入保留可查)</h3>
            <div class="form-grid">
              <label>
                起始里程(km)
                <input v-model.number="supplementForm.startMileageKm" type="number" min="0" step="0.1" required />
              </label>
              <label>
                结束里程(km)
                <input v-model.number="supplementForm.endMileageKm" type="number" min="0" step="0.1" required />
              </label>
              <div class="receipt-editor">
                <div class="receipt-head">
                  <span>票据金额</span>
                  <button type="button" class="secondary" @click="addReceipt(supplementForm)">添加票据</button>
                </div>
                <div v-for="(receipt, index) in supplementForm.receipts" :key="index" class="receipt-row">
                  <select v-model="receipt.kind">
                    <option v-for="kind in RECEIPT_KINDS" :key="kind" :value="kind">{{ kind }}</option>
                  </select>
                  <input v-model.number="receipt.amount" type="number" min="0" step="0.01" placeholder="金额(元)" />
                  <button type="button" class="danger" @click="removeReceipt(supplementForm, index)">移除</button>
                </div>
              </div>
              <label>
                补录原因(必填)
                <textarea v-model="supplementReason" required placeholder="说明补录原因,将写入修订记录" />
              </label>
              <div class="actions">
                <button type="submit" :disabled="!supplementReason.trim()">提交补录</button>
                <button type="button" class="secondary" @click="editingOrderId = ''">取消</button>
              </div>
            </div>
          </form>
        </article>
      </div>

      <div class="toolbar"><h2>已核销({{ closedOrders.length }})</h2></div>
      <div class="record-grid">
        <div v-if="closedOrders.length === 0" class="empty">暂无已核销单据</div>
        <article v-for="order in closedOrders" :key="order.id" class="record">
          <div class="record-head">
            <p class="record-title">{{ orderLabel(order) }}</p>
            <span class="status" data-status="已核销">已核销</span>
          </div>
          <div class="details">
            <span>实付: {{ formatYuan(actualOf(order.id)) }}</span>
            <span>预算: {{ formatYuan(store.routeOf(order)?.budgetAmount ?? 0) }}</span>
            <span>实际里程: {{ mileageOf(order.id) }} km</span>
            <span>票据: {{ store.returnOf(order.id)?.receipts.length ?? 0 }} 张</span>
          </div>
        </article>
      </div>

      <div class="toolbar"><h2>修订记录({{ store.revisions.length }})</h2></div>
      <div class="record-grid">
        <div v-if="store.revisions.length === 0" class="empty">暂无修订</div>
        <article v-for="revision in store.revisions" :key="revision.id" class="record">
          <div class="record-head">
            <p class="record-title">修订 · {{ formatTime(revision.createdAt) }}</p>
            <span class="status" data-status="已核销">{{ revision.after.outcome }}</span>
          </div>
          <p class="note">原因:{{ revision.reason }}</p>
          <div class="revision-diff">
            <div>
              <h4>修订前(原预算 {{ formatYuan(revision.before.budgetAmount) }})</h4>
              <p>
                里程 {{ revision.before.startMileageKm }} → {{ revision.before.endMileageKm }} km;
                实付 {{ formatYuan(revision.before.actualAmount) }};
                票据 {{ revision.before.receipts.length }} 张;判定 {{ revision.before.outcome }}
              </p>
            </div>
            <div>
              <h4>修订后(预算 {{ formatYuan(revision.after.budgetAmount) }})</h4>
              <p>
                里程 {{ revision.after.startMileageKm }} → {{ revision.after.endMileageKm }} km;
                实付 {{ formatYuan(revision.after.actualAmount) }};
                票据 {{ revision.after.receipts.length }} 张;判定 {{ revision.after.outcome }}
              </p>
            </div>
          </div>
        </article>
      </div>
    </section>
  </section>
</template>
