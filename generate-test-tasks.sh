#!/bin/bash
# 生成60个测试任务（简单20+中等20+复杂20）

OUTPUT_FILE="/Users/onetwo/Documents/trae_projects/Helix/test-tasks.json"

cat > "$OUTPUT_FILE" << 'EOF'
{
  "simple": [
    {"id": "S01", "task": "查看当前目录结构", "expected": "列出主要目录和文件"},
    {"id": "S02", "task": "统计项目中 TypeScript 文件数量", "expected": "返回数字"},
    {"id": "S03", "task": "查看 README.md 文件内容", "expected": "显示项目介绍"},
    {"id": "S04", "task": "查看 .gitignore 文件内容", "expected": "显示忽略规则"},
    {"id": "S05", "task": "查看 package.json 文件内容", "expected": "显示项目配置"},
    {"id": "S06", "task": "列出 packages 目录下的所有包", "expected": "显示包列表"},
    {"id": "S07", "task": "查看 tsconfig.json 配置", "expected": "显示 TypeScript 配置"},
    {"id": "S08", "task": "查看 bun.lock 文件大小", "expected": "显示文件大小"},
    {"id": "S09", "task": "统计项目中 .md 文件数量", "expected": "返回数字"},
    {"id": "S10", "task": "查看 .editorconfig 文件内容", "expected": "显示编辑器配置"},
    {"id": "S11", "task": "查看 turbo.json 配置", "expected": "显示 Turborepo 配置"},
    {"id": "S12", "task": "列出 scripts 目录下的脚本", "expected": "显示脚本列表"},
    {"id": "S13", "task": "查看 bunfig.toml 配置", "expected": "显示 Bun 配置"},
    {"id": "S14", "task": "统计项目中 .json 文件数量", "expected": "返回数字"},
    {"id": "S15", "task": "查看 LICENSE 文件内容", "expected": "显示许可证信息"},
    {"id": "S16", "task": "列出 .github 目录结构", "expected": "显示 GitHub 配置"},
    {"id": "S17", "task": "查看 sst.config.ts 配置", "expected": "显示 SST 配置"},
    {"id": "S18", "task": "统计项目中 .sh 文件数量", "expected": "返回数字"},
    {"id": "S19", "task": "查看 flake.nix 配置", "expected": "显示 Nix 配置"},
    {"id": "S20", "task": "列出 docs 目录结构", "expected": "显示文档目录"}
  ],
  "medium": [
    {"id": "M01", "task": "查看 packages/feishu-gateway/src/config.ts 文件内容", "expected": "显示配置模块"},
    {"id": "M02", "task": "查看 packages/opencode/src 目录结构", "expected": "显示核心引擎结构"},
    {"id": "M03", "task": "统计 packages/opencode/src 中的 TypeScript 文件数量", "expected": "返回数字"},
    {"id": "M04", "task": "查看 start-feishu.sh 脚本内容", "expected": "显示启动脚本"},
    {"id": "M05", "task": "查看 packages/app 目录结构", "expected": "显示 Web UI 结构"},
    {"id": "M06", "task": "查看 packages/console 目录结构", "expected": "显示控制台结构"},
    {"id": "M07", "task": "查看 packages/desktop 目录结构", "expected": "显示桌面应用结构"},
    {"id": "M08", "task": "查看 packages/sdk 目录结构", "expected": "显示 SDK 结构"},
    {"id": "M09", "task": "查看 packages/ui 目录结构", "expected": "显示 UI 组件结构"},
    {"id": "M10", "task": "查看 packages/shared 目录结构", "expected": "显示共享模块结构"},
    {"id": "M11", "task": "查看 packages/plugin 目录结构", "expected": "显示插件系统结构"},
    {"id": "M12", "task": "查看 packages/script 目录结构", "expected": "显示构建脚本结构"},
    {"id": "M13", "task": "查看 packages/containers 目录结构", "expected": "显示容器配置"},
    {"id": "M14", "task": "查看 infra 目录结构", "expected": "显示基础设施配置"},
    {"id": "M15", "task": "查看 nix 目录结构", "expected": "显示 Nix 配置"},
    {"id": "M16", "task": "查看 patches 目录内容", "expected": "显示补丁文件"},
    {"id": "M17", "task": "查看 .husky 目录结构", "expected": "显示 Git hooks"},
    {"id": "M18", "task": "查看 .vscode 目录结构", "expected": "显示 VS Code 配置"},
    {"id": "M19", "task": "查看 .zed 目录结构", "expected": "显示 Zed 配置"},
    {"id": "M20", "task": "查看 .mimocode 目录结构", "expected": "显示 MiMoCode 配置"}
  ],
  "complex": [
    {"id": "C01", "task": "查看 tushare 相关的 duckdb 数据库文件列表", "expected": "列出数据库文件"},
    {"id": "C02", "task": "检查 tushare_toplist.duckdb 数据库中的表结构", "expected": "显示表结构"},
    {"id": "C03", "task": "检查 tushare_moneyflow.duckdb 数据库中的表结构", "expected": "显示表结构"},
    {"id": "C04", "task": "查看 tushare_warehouse 目录结构", "expected": "显示仓库结构"},
    {"id": "C05", "task": "检查本地是否安装了 tushare 库", "expected": "显示安装状态"},
    {"id": "C06", "task": "检查 tushare 版本", "expected": "显示版本号"},
    {"id": "C07", "task": "查看 tushare_toplist.duckdb 中的数据行数", "expected": "返回数字"},
    {"id": "C08", "task": "查看 tushare_moneyflow.duckdb 中的数据行数", "expected": "返回数字"},
    {"id": "C09", "task": "查看 a_share_warehouse.duckdb 中的表列表", "expected": "显示表列表"},
    {"id": "C10", "task": "查看 a_share_warehouse.duckdb 中的数据行数", "expected": "返回数字"},
    {"id": "C11", "task": "查看 tushare_daily.duckdb 中的表结构", "expected": "显示表结构"},
    {"id": "C12", "task": "查看 tushare_daily.duckdb 中的数据行数", "expected": "返回数字"},
    {"id": "C13", "task": "统计所有 tushare 数据库的总数据量", "expected": "返回总行数"},
    {"id": "C14", "task": "查看 tushare 数据库中最新的数据日期", "expected": "显示日期"},
    {"id": "C15", "task": "查看 tushare 数据库中最早的数据日期", "expected": "显示日期"},
    {"id": "C16", "task": "检查 tushare 数据库中是否有招商银行(600036)的数据", "expected": "显示查询结果"},
    {"id": "C17", "task": "检查 tushare 数据库中是否有平安银行(000001)的数据", "expected": "显示查询结果"},
    {"id": "C18", "task": "查看 tushare 数据库中股票代码的分布情况", "expected": "显示分布统计"},
    {"id": "C19", "task": "查看 tushare 数据库中交易日期的分布情况", "expected": "显示分布统计"},
    {"id": "C20", "task": "检查 tushare 数据库中是否有缺失数据", "expected": "显示缺失情况"}
  ]
}
EOF

echo "✅ 测试任务已生成: $OUTPUT_FILE"
echo "   简单任务: 20 个"
echo "   中等任务: 20 个"
echo "   复杂任务: 20 个"
echo "   总计: 60 个"
