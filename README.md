# 路线费用核销台

由车辆调度小工具扩展而来,覆盖派车登记 → 放行校验 → 回场核销 → 补录修订的完整闭环。

- 行业:物流
- 技术栈:Vue3、Vite、TypeScript、Pinia
- 启动:`npm install && npm run dev`
- 构建:`npm run build`

## 功能

- **派车单登记**:路线、车牌、司机、时段、预计里程、桥费上限、押金;预计里程低于路线历史最低值、桥费超限或押金未缴时不得放行,页面实时显示差额与触发条件。
- **回场核销**:录入起止里程与票据金额,实付超预算一成或票据缺失自动转待复核;补录须填写原因并生成修订,修订前后快照与原预算均可查。
- **一致性**:任务、预算、票据、修订单键整体持久化到 localStorage,刷新后关系保持一致。

## 分层(数据、判定、页面各自独立)

```
src/
  domain/    判定层(纯函数):types.ts 领域模型、release.ts 放行校验、reconcile.ts 核销复核
  data/      数据层:seed.ts 路线档案种子、storage.ts localStorage 读写
  stores/    Pinia:reconciliation.ts 组装数据与判定,变更自动落盘
  views/     页面层:DispatchView.vue 派车登记、ReconcileView.vue 回场核销
```
