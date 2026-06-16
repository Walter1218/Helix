# Helix 自主模式测试（同一 Session，有上下文记忆）

| ID | 难度 | 任务 | 状态 | 耗时 |
|----|------|------|------|------|
| S01 | 简单 | 查看当前目录结构 | ✅ | 4s |
| S02 | 简单 | 统计项目中 TypeScript 文件数量 | ✅ | 4s |
| S03 | 简单 | 查看 README.md 文件内容 | ✅ | 4s |
| S04 | 简单 | 查看 .gitignore 文件内容 | ✅ | 4s |
| S05 | 简单 | 查看 package.json 文件内容 | ✅ | 4s |
| S06 | 简单 | 列出 packages 目录下的所有包 | ✅ | 4s |
| S07 | 简单 | 查看 tsconfig.json 配置 | ✅ | 4s |
| S08 | 简单 | 查看 bun.lock 文件大小 | ✅ | 4s |
| S09 | 简单 | 统计项目中 .md 文件数量 | ✅ | 4s |
| S10 | 简单 | 查看 .editorconfig 文件内容 | ✅ | 4s |
| S11 | 简单 | 查看 turbo.json 配置 | ✅ | 4s |
| S12 | 简单 | 列出 scripts 目录下的脚本 | ✅ | 4s |
| S13 | 简单 | 查看 bunfig.toml 配置 | ✅ | 4s |
| S14 | 简单 | 统计项目中 .json 文件数量 | ✅ | 4s |
| S15 | 简单 | 查看 LICENSE 文件内容 | ✅ | 4s |
| S16 | 简单 | 列出 .github 目录结构 | ✅ | 4s |
| S17 | 简单 | 查看 sst.config.ts 配置 | ✅ | 4s |
| S18 | 简单 | 统计项目中 .sh 文件数量 | ✅ | 4s |
| S19 | 简单 | 查看 flake.nix 配置 | ✅ | 4s |
| S20 | 简单 | 列出 docs 目录结构 | ✅ | 4s |
| M01 | 中等 | 查看 packages/feishu-gateway/src/config.ts 文件内容 | ✅ | 4s |
| M02 | 中等 | 查看 packages/opencode/src 目录结构 | ✅ | 4s |
| M03 | 中等 | 统计 packages/opencode/src 中的 TypeScript 文件数量 | ✅ | 4s |
| M04 | 中等 | 查看 start-feishu.sh 脚本内容 | ✅ | 4s |
| M05 | 中等 | 查看 packages/app 目录结构 | ✅ | 4s |
| M06 | 中等 | 查看 packages/console 目录结构 | ✅ | 4s |
| M07 | 中等 | 查看 packages/desktop 目录结构 | ✅ | 4s |
| M08 | 中等 | 查看 packages/sdk 目录结构 | ✅ | 4s |
| M09 | 中等 | 查看 packages/ui 目录结构 | ✅ | 4s |
| M10 | 中等 | 查看 packages/shared 目录结构 | ✅ | 4s |
| M11 | 中等 | 查看 packages/plugin 目录结构 | ✅ | 4s |
| M12 | 中等 | 查看 packages/script 目录结构 | ✅ | 4s |
| M13 | 中等 | 查看 packages/containers 目录结构 | ✅ | 4s |
| M14 | 中等 | 查看 infra 目录结构 | ✅ | 4s |
| M15 | 中等 | 查看 nix 目录结构 | ✅ | 4s |
| M16 | 中等 | 查看 patches 目录内容 | ✅ | 4s |
| M17 | 中等 | 查看 .husky 目录结构 | ✅ | 4s |
| M18 | 中等 | 查看 .vscode 目录结构 | ✅ | 4s |
| M19 | 中等 | 查看 .zed 目录结构 | ✅ | 4s |
| M20 | 中等 | 查看 .mimocode 目录结构 | ✅ | 4s |
| C01 | 复杂 | 查看 tushare 相关的 duckdb 数据库文件列表 | ✅ | 4s |
| C02 | 复杂 | 检查 tushare_toplist.duckdb 数据库中的表结构 | ✅ | 4s |
| C03 | 复杂 | 检查 tushare_moneyflow.duckdb 数据库中的表结构 | ✅ | 4s |
| C04 | 复杂 | 查看 tushare_warehouse 目录结构 | ✅ | 4s |
| C05 | 复杂 | 检查本地是否安装了 tushare 库 | ✅ | 4s |
| C06 | 复杂 | 检查 tushare 版本 | ✅ | 4s |
| C07 | 复杂 | 查看 tushare_toplist.duckdb 中的数据行数 | ✅ | 4s |
| C08 | 复杂 | 查看 tushare_moneyflow.duckdb 中的数据行数 | ✅ | 5s |
| C09 | 复杂 | 查看 a_share_warehouse.duckdb 中的表列表 | ✅ | 4s |
| C10 | 复杂 | 查看 a_share_warehouse.duckdb 中的数据行数 | ✅ | 4s |
| C11 | 复杂 | 查看 tushare_daily.duckdb 中的表结构 | ✅ | 4s |
| C12 | 复杂 | 查看 tushare_daily.duckdb 中的数据行数 | ✅ | 4s |
| C13 | 复杂 | 统计所有 tushare 数据库的总数据量 | ✅ | 4s |
| C14 | 复杂 | 查看 tushare 数据库中最新的数据日期 | ✅ | 4s |
| C15 | 复杂 | 查看 tushare 数据库中最早的数据日期 | ✅ | 4s |
| C16 | 复杂 | 检查 tushare 数据库中是否有招商银行(600036)的数据 | ✅ | 4s |
| C17 | 复杂 | 检查 tushare 数据库中是否有平安银行(000001)的数据 | ✅ | 4s |
| C18 | 复杂 | 查看 tushare 数据库中股票代码的分布情况 | ✅ | 4s |
| C19 | 复杂 | 查看 tushare 数据库中交易日期的分布情况 | ✅ | 4s |
| C20 | 复杂 | 检查 tushare 数据库中是否有缺失数据 | ✅ | 4s |

## 汇总

| 指标 | 数值 |
|------|------|
| 总任务 | 60 |
| 通过 | 60 |
| 失败 | 0 |
| 通过率 | 100% |
| Session | ses_12e88b41affeYcRSzSUtdkrGeW |
