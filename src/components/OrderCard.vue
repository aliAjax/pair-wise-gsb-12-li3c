<script setup lang="ts">
// 页面层组件：单据全生命周期操作面板
// - 待放行：补正押金/里程/桥费上限后再次申请放行
// - 待回场：回场录入起止里程与票据，实时预览核销判定
// - 待复核：展示触发条件，补录原因后提交修订（原预算快照保留可查）
// - 已核销：回场明细 + 修订历史
import { computed, reactive, ref } from "vue";
import type { DispatchOrder, Receipt } from "../types";
import { useDispatchStore } from "../store";
import { evaluateGate, evaluateReturn, gatePassed, receiptTotal, tollReceiptTotal, yuan } from "../rules";
import ReceiptEditor from "./ReceiptEditor.vue";

const props = defineProps<{ order: DispatchOrder }>();
const store = useDispatchStore();

const statusClass: Record<string, string> = {
  待放行: "st-block",
  待回场: "st-wait",
  待复核: "st-review",
  已核销: "st-done"
};

function fmtTime(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("zh-CN", { hour12: false });
}

// ---------- 待放行补正 ----------
const fixForm = reactive({
  estimatedKm: props.order.budget.estimatedKm,
  tollCap: props.order.budget.tollCap,
  depositPaid: props.order.depositPaid
});
const fixResult = ref<{ ok: boolean; lines: string[] } | null>(null);

const fixGate = computed(() =>
  evaluateGate({
    route: props.order.route,
    estimatedKm: Number(fixForm.estimatedKm) || 0,
    tollCap: Number(fixForm.tollCap) || 0,
    depositRequired: props.order.budget.depositRequired,
    depositPaid: Number(fixForm.depositPaid) || 0,
    routes: store.routes
  })
);

function reattempt() {
  const res = store.reattemptRelease(
    props.order.id,
    Number(fixForm.depositPaid) || 0,
    Number(fixForm.estimatedKm) || 0,
    Number(fixForm.tollCap) || 0
  );
  fixResult.value = { ok: res.released, lines: res.blocked };
}

// ---------- 回场录入 ----------
const ret = reactive({
  startKm: 0,
  endKm: 0,
  receipts: [] as Receipt[]
});
const retMessage = ref("");

const retVerdict = computed(() =>
  evaluateReturn(props.order, {
    startKm: Number(ret.startKm) || 0,
    endKm: Number(ret.endKm) || 0,
    receipts: ret.receipts
  })
);

function submitReturn() {
  if (!(Number(ret.endKm) > Number(ret.startKm))) {
    retMessage.value = "起止里程不合法";
    return;
  }
  store.recordReturn(props.order.id, {
    startKm: Number(ret.startKm) || 0,
    endKm: Number(ret.endKm) || 0,
    receipts: ret.receipts
  });
  retMessage.value = "";
}

// ---------- 待复核补录 ----------
const sup = reactive({
  startKm: props.order.returnRecord?.startKm ?? 0,
  endKm: props.order.returnRecord?.endKm ?? 0,
  receipts: (props.order.returnRecord?.receipts ?? []).map((r) => ({ ...r })) as Receipt[],
  reason: ""
});

const supVerdict = computed(() =>
  evaluateReturn(props.order, {
    startKm: Number(sup.startKm) || 0,
    endKm: Number(sup.endKm) || 0,
    receipts: sup.receipts
  })
);

const currentReasons = computed(() => {
  const record = props.order.returnRecord;
  if (!record) return [];
  return evaluateReturn(props.order, {
    startKm: record.startKm,
    endKm: record.endKm,
    receipts: record.receipts
  }).reasons;
});

function submitSupplement() {
  if (!sup.reason.trim()) return;
  store.supplement(
    props.order.id,
    {
      startKm: Number(sup.startKm) || 0,
      endKm: Number(sup.endKm) || 0,
      receipts: sup.receipts
    },
    sup.reason
  );
  sup.reason = "";
}

const routeStat = computed(() => store.routes.find((r) => r.route === props.order.route));
const receiptCount = computed(() => props.order.returnRecord?.receipts.length ?? 0);
const paid = computed(() => props.order.returnRecord?.paidTotal ?? 0);
const tollPaid = computed(() => (props.order.returnRecord ? tollReceiptTotal(props.order.returnRecord.receipts) : 0));
</script>

<template>
  <article class="order-card">
    <div class="record-head">
      <div>
        <p class="record-title">{{ order.code }}</p>
        <p class="sub">{{ order.route }} · {{ order.vehicle }} · {{ order.driver }}</p>
      </div>
      <span class="status" :class="statusClass[order.status]">{{ order.status }}</span>
    </div>

    <div class="details">
      <span>日期：{{ order.date }}</span>
      <span>时段：{{ order.startTime }}–{{ order.endTime }}</span>
      <span>预计里程：{{ order.budget.estimatedKm }}km</span>
      <span>路线历史最低：{{ routeStat ? `${routeStat.minKm}km（${routeStat.tripCount}趟）` : "暂无" }}</span>
      <span>押金：{{ yuan(order.depositPaid) }} / {{ yuan(order.budget.depositRequired) }}</span>
      <span>登记时间：{{ fmtTime(order.createdAt) }}</span>
    </div>

    <!-- 原预算快照：始终可查，补录/修订不覆盖 -->
    <div class="budget-box">
      <p class="box-title">原预算（{{ fmtTime(order.createdAt) }} 快照）</p>
      <div class="budget-items">
        <span>油费 {{ yuan(order.budget.fuelBudget) }}<em>{{ order.budget.estimatedKm }}km × {{ order.budget.costPerKm }}元/km</em></span>
        <span>桥费 {{ yuan(order.budget.tollBudget) }}<em>桥费上限</em></span>
        <span>合计 {{ yuan(order.budget.total) }}</span>
        <span class="cap">核销线 {{ yuan(order.budget.capLine) }}<em>预算 × 1.1</em></span>
      </div>
    </div>

    <!-- 待放行：补正 -->
    <div v-if="order.status === '待放行'" class="action-box">
      <p class="box-title">放行条件未满足，补正后重新申请</p>
      <div class="inline-grid">
        <label>预计里程（km）<input v-model.number="fixForm.estimatedKm" type="number" min="0" /></label>
        <label>桥费上限（元）<input v-model.number="fixForm.tollCap" type="number" min="0" /></label>
        <label>实缴押金（元）<input v-model.number="fixForm.depositPaid" type="number" min="0" /></label>
      </div>
      <ul class="verdict-list">
        <li v-for="item in fixGate" :key="item.key" :class="item.passed ? 'ok' : 'block'">
          {{ item.passed ? "✓" : "✕" }} {{ item.label }}：{{ item.trigger }}，{{ item.difference }}
        </li>
      </ul>
      <button type="button" :disabled="!gatePassed(fixGate)" @click="reattempt">申请放行</button>
      <div v-if="fixResult" :class="['fix-result', fixResult.ok ? 'ok' : 'block']">
        <p v-if="fixResult.ok">已放行。</p>
        <ul v-else>
          <li v-for="(line, i) in fixResult.lines" :key="i">{{ line }}</li>
        </ul>
      </div>
    </div>

    <!-- 待回场：录入 -->
    <div v-else-if="order.status === '待回场'" class="action-box">
      <p class="box-title">回场录入</p>
      <div class="inline-grid">
        <label>起码（km）<input v-model.number="ret.startKm" type="number" min="0" /></label>
        <label>止码（km）<input v-model.number="ret.endKm" type="number" min="0" /></label>
        <span class="km-out">实际里程 {{ retVerdict.actualKm }}km</span>
      </div>
      <ReceiptEditor v-model="ret.receipts" />
      <ul class="verdict-list">
        <li :class="retVerdict.validKm ? 'ok' : 'block'">
          {{ retVerdict.validKm ? "✓" : "✕" }} 里程：{{ retVerdict.validKm ? "起止码正常" : "止码须大于起码" }}
        </li>
        <li :class="retVerdict.receiptMissing ? 'block' : 'ok'">
          {{ retVerdict.receiptMissing ? "✕" : "✓" }} 票据：{{ retVerdict.receiptCount }} 张{{ retVerdict.receiptMissing ? "，票据缺失" : "" }}
        </li>
        <li :class="retVerdict.tollOverCap ? 'block' : 'ok'">
          {{ retVerdict.tollOverCap ? "✕" : "✓" }} 桥费：{{ yuan(tollReceiptTotal(ret.receipts)) }} / 上限 {{ yuan(order.budget.tollCap) }}
        </li>
        <li :class="retVerdict.overBudget ? 'block' : 'ok'">
          {{ retVerdict.overBudget ? "✕" : "✓" }} 实付：{{ yuan(receiptTotal(ret.receipts)) }} / 核销线 {{ yuan(order.budget.capLine) }}
          <template v-if="retVerdict.overBudget">，超 {{ yuan(retVerdict.overAmount) }}</template>
        </li>
      </ul>
      <button type="button" @click="submitReturn">
        {{ retVerdict.status === '待复核' ? '提交（将转待复核）' : '提交并核销' }}
      </button>
      <p v-if="retMessage" class="error-text">{{ retMessage }}</p>
    </div>

    <!-- 待复核：补录修订 -->
    <div v-else-if="order.status === '待复核'" class="action-box review-box">
      <p class="box-title">待复核触发条件</p>
      <ul class="verdict-list">
        <li v-for="(reason, i) in currentReasons" :key="i" class="block">{{ reason }}</li>
      </ul>
      <p class="box-title">补录（提交后生成修订，原预算不变）</p>
      <div class="inline-grid">
        <label>起码（km）<input v-model.number="sup.startKm" type="number" min="0" /></label>
        <label>止码（km）<input v-model.number="sup.endKm" type="number" min="0" /></label>
        <span class="km-out">实际里程 {{ supVerdict.actualKm }}km</span>
      </div>
      <ReceiptEditor v-model="sup.receipts" />
      <label class="reason-label">
        补录原因（必填，写入修订）
        <textarea v-model="sup.reason" placeholder="如：发票次日补开、桥费按实际路段结算……" />
      </label>
      <ul class="verdict-list">
        <li v-for="(reason, i) in supVerdict.reasons" :key="i" class="block">{{ reason }}</li>
        <li v-if="supVerdict.status === '已核销'" class="ok">✓ 补录内容满足核销条件，提交后转已核销</li>
      </ul>
      <button type="button" :disabled="!sup.reason.trim()" @click="submitSupplement">
        补录提交并生成修订
      </button>
    </div>

    <!-- 已核销 / 待复核可见的回场结果 -->
    <div v-if="order.returnRecord" class="return-box">
      <p class="box-title">回场与票据</p>
      <div class="details">
        <span>起码：{{ order.returnRecord.startKm }}km</span>
        <span>止码：{{ order.returnRecord.endKm }}km</span>
        <span>实际里程：{{ order.returnRecord.actualKm }}km</span>
        <span>票据：{{ receiptCount }} 张</span>
        <span>桥费票据：{{ yuan(tollPaid) }}</span>
        <span>实付合计：{{ yuan(paid) }}</span>
      </div>
      <ul class="receipt-list">
        <li v-for="r in order.returnRecord.receipts" :key="r.id">
          <span class="rcpt-type">{{ r.type }}</span><span>{{ yuan(r.amount) }}</span>
        </li>
      </ul>
    </div>

    <!-- 修订历史 -->
    <div v-if="order.revisions.length" class="revision-box">
      <p class="box-title">修订历史（{{ order.revisions.length }}）</p>
      <div v-for="rev in order.revisions" :key="rev.id" class="revision-item">
        <div class="rev-head">
          <span>{{ fmtTime(rev.createdAt) }}</span>
          <span>{{ yuan(rev.oldPaid) }} → {{ yuan(rev.newPaid) }}</span>
        </div>
        <p>票据 {{ rev.receiptCountBefore }} 张 → {{ rev.receiptCountAfter }} 张</p>
        <p class="rev-reason">原因：{{ rev.reason }}</p>
      </div>
    </div>

    <div class="actions">
      <button class="danger small" type="button" @click="store.remove(order.id)">删除单据</button>
    </div>
  </article>
</template>
