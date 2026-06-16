# Helix 自主模式测试报告

| ID | 难度 | 任务 | 状态 | 耗时 | 输出摘要 |
|----|------|------|------|------|----------|
| S01 | 简单 | 查看当前目录结构 | ✅ 通过 | 5s | ```\nHelix/\n├── .dev-home/          # 开发环境配置\n├── .dogf |
| S02 | 简单 | 统计项目中 TypeScript 文件数量 | ✅ 通过 | 6s | TypeScript 文件总数：**1980 个**（.ts 和 .tsx，排除 node_modules/dist |
| S03 | 简单 | 查看 README.md 文件内容 | ✅ 通过 | 5s | README.md 文件已读取完毕。这是 **Helix** 项目的说明文档，主 |
| S04 | 简单 | 列出 packages 目录下的所有包 | ✅ 通过 | 5s | `packages` 目录下共有 **17** 个包：\n\n| 包名 | 说明 |\n|------|---- |
| S05 | 简单 | 查看 package.json 中的 scripts | ✅ 通过 | 5s | `package.json` 中的 `scripts` 如下：\n\n```json\n{\n  \  |
| M01 | 中等 | 查看 packages/feishu-gateway/src/config.ts 文件内容 | ✅ 通过 | 5s | 这是 `packages/feishu-gateway/src/config.ts` 的完整内容（46行）：\n\n |
| M02 | 中等 | 查看 packages/opencode/src 目录结构 | ✅ 通过 | 5s | `packages/opencode/src` 包含 56 个条目，主要模块：\n\n| 目录 | 用 |
| M03 | 中等 | 统计 packages/opencode/src 中的 TypeScript 文件数量 | ✅ 通过 | 5s | `packages/opencode/src` 目录下共有 **587** 个 TypeScript 文件（`.ts` +  |
| M04 | 中等 | 查看 start-feishu.sh 脚本内容 | ✅ 通过 | 5s | 脚本内容如上，主要功能：\n\n1. **启动 mimo serve** — 使用编 |
| M05 | 中等 | 查看 packages/app 目录结构 | ✅ 通过 | 5s | packages/app 目录结构：\n\n```\npackages/app/\n├── .gitignore\n├─ |
| C01 | 复杂 | 查看 tushare 相关的 duckdb 数据库文件列表 | ✅ 通过 | 5s | 文件详情：\n\n| 文件名 | 大小 | 最后修改 |\n|--------|------|----- |
| C02 | 复杂 | 检查 tushare_toplist.duckdb 数据库中的表结构 | ✅ 通过 | 6s | 找到两个 `tushare_toplist.duckdb` 文件，表结构如下：\n\n---\n\n###  |
| C03 | 复杂 | 查看 tushare_warehouse 目录结构 | ✅ 通过 | 5s | `tushare_warehouse` 目录在当前项目中不存在。它可能位于其他位 |
| C07 | 复杂 | 查看 tushare_toplist.duckdb 中的数据行数 | ✅ 通过 | 5s | 找到了多个 `tushare_toplist.duckdb` 文件：\n\n| 路径 | 表名 | 行数 |
| C09 | 复杂 | 查看 a_share_warehouse.duckdb 中的表列表 | ✅ 通过 | 5s | 数据库 `/Users/onetwo/a_share_warehouse/a_share_warehouse.duckdb` 中共有 |

## 汇总

| 指标 | 数值 |
|------|------|
| 总任务 | 15 |
| 通过 | 15 |
| 超时 | 0 |
| 失败 | 0 |
| 通过率 | 100% |
