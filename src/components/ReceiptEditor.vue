<script setup lang="ts">
// 页面层组件：票据明细录入（油费/桥费/其他），数据由父组件持有
import { computed } from "vue";
import type { Receipt, ReceiptType } from "../types";
import { receiptTotal, tollReceiptTotal, yuan } from "../rules";

const props = defineProps<{ modelValue: Receipt[] }>();
const emit = defineEmits<{ "update:modelValue": [value: Receipt[]] }>();

const types: ReceiptType[] = ["油费", "桥费", "其他"];

const total = computed(() => receiptTotal(props.modelValue));
const tollTotal = computed(() => tollReceiptTotal(props.modelValue));

function patch(index: number, patch: Partial<Receipt>) {
  const next = props.modelValue.map((item, i) => (i === index ? { ...item, ...patch } : item));
  emit("update:modelValue", next);
}

function add() {
  emit("update:modelValue", [...props.modelValue, { id: crypto.randomUUID(), type: "油费", amount: 0 }]);
}

function remove(index: number) {
  emit("update:modelValue", props.modelValue.filter((_, i) => i !== index));
}
</script>

<template>
  <div class="receipt-editor">
    <div v-if="modelValue.length === 0" class="receipt-empty">未添加票据，将判定为「票据缺失」转待复核</div>
    <div v-for="(receipt, index) in modelValue" :key="receipt.id" class="receipt-row">
      <select :value="receipt.type" @change="patch(index, { type: ($event.target as HTMLSelectElement).value as ReceiptType })">
        <option v-for="t in types" :key="t" :value="t">{{ t }}</option>
      </select>
      <input
        :value="receipt.amount"
        type="number"
        min="0"
        step="0.01"
        @input="patch(index, { amount: Number(($event.target as HTMLInputElement).value) || 0 })"
      />
      <button type="button" class="danger small" @click="remove(index)">删</button>
    </div>
    <button type="button" class="secondary small" @click="add">+ 添加票据</button>
    <div class="receipt-sum">
      <span>票据 {{ modelValue.length }} 张</span>
      <span>桥票合计 {{ yuan(tollTotal) }}</span>
      <strong>实付合计 {{ yuan(total) }}</strong>
    </div>
  </div>
</template>
