# Helix 能力补全路线图 (Capability Gap-Filling Roadmap)

> 基于 2026-06-15 的架构审计（10 项缺口）| **已完成: 10/10** 🟢

## ✅ 全部完成 (10/10)

| # | 缺口 | 文件 | 能力 |
|---|------|------|------|
| 1 | 飞轮端到端 | `setup_local_cron.sh` → launchd | macOS 原生调度，不需要 Full Disk Access |
| 2 | AskUserQuestion | `src/tool/ask-user-question.ts` + registry | Agent 主动追问，挂起等待回答 |
| 3 | 轻量 VFS 沙箱 | `src/workflow/vfs-sandbox.ts` | Copy-on-Write overlay，>500MB 自动降级 |
| 4 | DPO Judge 验证门 | `script/dogfooding/export_dpo.ts` | 断言下降/代码缩水/差异检测 |
| 5 | AlignmentGuard + inbox | `src/observability/alignment-guard.ts` | 4 个告警触发点 → actor send 自我纠偏 |
| 6 | ProgressObserver | `script/dogfooding/beta_evolution_loop.ts` | 空闲 + 死循环 + 硬超时兜底 |
| 7 | FSM resume HTTP endpoint | `src/server/routes/instance/session-resume.ts` | POST /:sessionID/resume + GET /:sessionID/pending-question |
| 8 | MCP Server | `src/mcp/helix-mcp-server.ts` | 7 个标准化 Tool（run_goal / trace / alerts / suspend / resume / 读写 AGENTS.md） |
| 9 | 多模态 Screenshot | `src/tool/screenshot.ts` | 截图 + 视觉分析 Tool（需 MiMo 2.5 或 Claude/GPT-4o） |
| 10 | 记忆代谢压力测试 | `script/dogfooding/stress-test-memory.ts` | 200 条规则 → 80% 文件修改 → 代谢率验证 |

## 🎉 汇总

Helix 从架构设计到工程落地，三大闭环（执行闭环 / 知识闭环 / 数据闭环）所需要的核心组件已全部补完。

下次编译前需要手动注册的工具：
- ScreenshotTool → `packages/opencode/src/tool/registry.ts`（import + init + builtin 列表）

## 已解决的核心问题

| 问题 | 解法 |
|------|------|
| 🍎 macOS Cron 权限拦截 | launchd 替代 crontab |
| 🤖 Agent 死循环卡死飞轮 | ProgressObserver 空闲/循环检测 |
| 🔧 大项目沙箱磁盘爆炸 | VFSOverlay Copy-on-Write（>500MB 自动降级） |
| 🧠 DPO 数据集 GIGO | Judge 验证门（断言下降/代码缩水/差异） |
| 📢 Agent 偏离目标无感知 | AlignmentGuard → Event Bus + inbox 自我纠偏 |
| ❓ 意图模糊无效执行 | AskUserQuestion 主动追问 + resume API |
| 🔌 外部工具无法接入 | MCP Server 7 个标准 Tool |
| 👀 缺少视觉能力 | Screenshot Tool（MiMo 2.5 vision, not 2.5 Pro） |
| 🧪 记忆代谢未验证 | stress-test-memory.ts 压力测试 |
| ⏸️ FSM 无恢复通道 | session-resume.ts HTTP endpoint |
