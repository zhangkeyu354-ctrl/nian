# 第 3 阶段：联机需求、对齐与交互基线

沿用 PRESSURE_TEST.md 的 Proceed，本次用户“继续”明确授权总指令第 3 阶段，不是新产品。使用 tdd-builder；不增加第 4 阶段 UI 范围。

## PRD 补充

| ID | 需求 | 验收 |
|---|---|---|
| REQ-301 | rk: 独立房间，2–4 人、房主设置/开始/下一局 | 凭证、满员准备、房主权限、局数限制均测试 |
| REQ-302 | token 重连、JSON 原子快照、RK_DATA_DIR | 断线/新实例恢复同一牌架、草稿、历史和 seq |
| REQ-303 | 服务端时间和种子 | 客户端不能伪造 actor/now/TIMEOUT；生产拒绝指定 seed |
| REQ-304 | 私有草稿不广播他人 | 真实 Socket.IO 观察对手收到的包数为 0；提交后公共更新 |
| REQ-305 | 幂等与版本并发 | seq 跨重连保留；重复 COMMIT 不重复罚/发牌；过期公共版本拒绝 |
| REQ-306 | 真实浏览器协议验收 | 2/3/4 人整局；不足破冰/非法组合/Joker/超时/重连/空池 |

## Alignment

Aligned。范围：rk-rooms、rk-protocol、main 仅注册新 handler/健康字段、测试/脚本/文档；不改其他游戏规则和样式。用户授权范围来自总指令阶段表和本次“继续”，无额外访谈/签字。Codex 负责实现、隐私验证、真实结果留证；Q01–Q09 沿用默认。

## 非 UI 基线

复用 DM 的 token、Socket.IO 按人投影视图、在线连接计数、JSON 临时文件 rename 原子落盘、闲置清理。公共 version 仅公共变更递增；草稿只向同 token 的连接更新，维护独立私有 revision。外部 seq 每座位覆盖大厅与引擎命令，nextSeq 只给本人；engine actor/seq/now 由房间层构造。
非法 COMMIT 是已生效的罚牌事务：ack 返回 ok:false + consumed:true + 最新 snapshot，必须先存盘并广播公共变化；客户端不能把它当成未执行重试新 seq。结构/权限失败不消耗 seq。
重连 token 验证失败不能降级伪装为已有玩家。匿名可看大厅玩家/连接状态，但无游戏 view。多人同 token 同步私有草稿。服务器到期广播合法投影，不记录牌架。
验收浏览器在独立上下文加载现有服务器 Socket.IO 客户端，通过真实 WebSocket 驱动；此为协议验收，不声称完成 UI 点击/美术/截图，第 4 阶段另做。
下一步：用户已授权实施；测试先行。
