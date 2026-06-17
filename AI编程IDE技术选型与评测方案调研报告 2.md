# AI 编程 IDE 技术选型与评测方案调研报告

**日期**：2026 年 6 月 16 日  
**目标**：基于已有 Agent 核心模块，选型并搭建类似 Qoder/Trae/Cursor 的 AI 编程 IDE

---

## 一、执行摘要

本报告针对"基于已有 Agent 核心模块，如何搭建 AI 编程 IDE"这一核心问题，从技术选型、开源参考、评测标准、评测验证、竞争对标五个维度进行了全面调研，结论如下：

**技术选型**：推荐使用 **VS Code 扩展（Extension）路线** 作为 MVP 验证方案，后续可迁移至 Eclipse Theia 以获得更深定制能力。

**评测标准**：推荐 **SWE-bench Verified + Terminal-Bench v2** 作为核心评测集，二者分别代表行业金标准和 Agent 自主能力评测。

**竞争水位**：MiMo Code 在 SWE-bench Verified 上达到 82%，Claude Code（Opus 4.8）达到 88.6%，Trae 达到 75.2%，行业第一梯队在 80%+ 水平。

---

## 二、技术选型方案

### 2.1 可选路线对比

| 路线 | 定制能力 | 维护成本 | 生态兼容 | 推荐度 | 适用阶段 |
|------|---------|---------|---------|--------|---------|
| Fork Code-OSS | ★★★★★ | ★ | ★★ | ★★ | 长期（有维护团队）|
| **VS Code 扩展** | **★★** | **★★★★★** | **★★★★★** | **★★★★** | **MVP 验证** |
| **Eclipse Theia** | **★★★★** | **★★★★** | **★★★★** | **★★★★★** | **长期方案** |
| Monaco + Electron | ★★★★★ | ★★ | ★ | ★★★ | 完全差异化 |
| code-server | ★★★ | ★★★ | ★★★★ | ★★★ | 云端 IDE |

### 2.2 推荐方案：VS Code 扩展 → Eclipse Theia 渐进路线

**阶段一（MVP，4-8 周）**：VS Code 扩展
- 开发最快，零维护负担
- 完整兼容 VS Code 市场和扩展生态
- 快速验证 Agent 核心与 IDE 的集成效果

**阶段二（深度集成，8-12 周）**：如需要扩展 VS Code Extension API 的限制，迁移至 Eclipse Theia
- 避免 Fork VS Code 的维护地狱
- 支持 VS Code 扩展，兼顾生态与定制能力
- 有 Theia AI 框架专门支持 AI IDE 开发

### 2.3 VS Code 扩展核心架构

```
已有 Agent 核心模块（Python/Node.js）
        ↓ WebSocket / stdio
┌─────────────────────────────────────┐
│         VS Code 扩展层             │
│  ┌────────────┐ ┌────────────┐  │
│  │ Webview 面板│ │ 行内对话   │  │
│  │ (React Chat) │ │ (Inline AI)│  │
│  └────────────┘ └────────────┘  │
│  ┌────────────┐ ┌────────────┐  │
│  │ 上下文收集  │ │ Agent 通信  │  │
│  │ (IDE Context)│ │ (Client)   │  │
│  └────────────┘ └────────────┘  │
└─────────────────────────────────────┘
```

**关键技术点**：
- **上下文收集**：当前文件、选中代码、光标位置、LSP 诊断信息、项目结构
- **通信方式**：WebSocket（推荐）或 stdio（本地进程）
- **流式响应**：支持 Streaming 实时展示 Agent 思考过程
- **Diff 预览**：使用 `vscode.diff` 命令展示代码修改
- **行内补全**：实现 `InlineCompletionItemProvider`

### 2.4 可借鉴的开源项目

| 项目 | 类型 | 可借鉴点 |
|------|------|-----------|
| **Cline** | VS Code 扩展 | Agent 与 VS Code 集成、Diff 预览、权限控制、MCP 客户端 |
| **Continue** | VS Code/JetBrains 扩展 | 模型适配层、上下文管理、UI 组件 |
| **Aider** | 终端工具 | 代码库语义索引（RepoMap）、上下文压缩、AGENTS.md 解析 |
| **Codelf** | 独立 IDE（Electron） | Electron + Monaco 集成方案、LSP 集成 |
| **Kilo Code** | VS Code 扩展 | 多步骤任务规划、自主 Agent 错误处理 |

---

## 三、评测集选型

### 3.1 推荐组合：SWE-bench Verified + Terminal-Bench v2

#### 评测集一：SWE-bench Verified ★★★★★

| 维度 | 详情 |
|------|------|
| **机构** | Princeton University + OpenAI 验证 |
| **任务数** | 500 个（从 2,294 个中人工筛选） |
| **评测内容** | 从 GitHub Issue 描述生成代码修复，自动运行测试验证 |
| **权威性** | 行业金标准，所有顶尖团队均在此跑分 |
| **最新成绩** | Claude Opus 4.8: 88.6%、MiMo Code: 82% |

**为什么必须选**：
- 唯一被全行业认可的 Coding Agent 评测标准
- 用户/投资人/同行会将你的成绩与此对标
- 覆盖"理解问题 + 修改代码 + 通过测试"完整流程

#### 评测集二：Terminal-Bench v2 ★★★★★

| 维度 | 详情 |
|------|------|
| **机构** | Laude Institute |
| **任务数** | 84 个 |
| **评测内容** | Agent 在终端环境中的自主操作能力（bash、文件操作、问题解决） |
| **独特性** | SWE-bench 不评测动态环境交互，Terminal-Bench 填补此空白 |
| **综合指数** | 被 Artificial Analysis Coding Agent Index 采用 |

**为什么必须选**：
- 与 SWE-bench 高度互补（静态代码 vs 动态交互）
- 更依赖 Agent harness 能力（工具调用、规划、错误处理）
- 更能体现你已有 Agent 核心模块的价值

### 3.2 其他评测集参考（可选）

| 评测集 | 类型 | 推荐度 | 适用场景 |
|--------|------|--------|----------|
| Artificial Analysis Index | 综合（3 合 1） | ★★★★ | 全面对比（含成本、Token、时间） |
| LiveCodeBench | 代码生成 | ★★★ | 基础能力评测（无数据污染） |
| BigCodeBench | 代码生成 | ★★★★ | 实用编程任务评测 |
| AgentBench | 通用 Agent | ★★★ | 通用能力评测 |
| SWE-bench Live | 软件工程 | ★★★★ | 防止数据污染（每月更新） |

---

## 四、评测集体量与验证方案

### 4.1 评测集体量分析

#### SWE-bench Verified

| 维度 | 数据 |
|------|------|
| **任务总数** | 500 个 |
| **单个任务运行时间** | 5-15 分钟（取决于 Agent 复杂度） |
| **预计总时间（串行）** | 500 × 10 分钟 ≈ **83 小时** |
| **预计总时间（并行 10 个）** | ≈ **8.3 小时** |
| **API 成本估算** | 每个任务约 $0.5-2（取决于模型），总计 **$250-1000** |

**任务结构**：
- 每个任务包含一个 GitHub Issue
- 需要 Agent 理解问题 → 修改代码 → 运行测试
- 自动化验证（Docker 环境中运行测试）

#### Terminal-Bench v2

| 维度 | 数据 |
|------|------|
| **任务总数** | 84 个 |
| **单个任务运行时间** | 10-30 分钟（终端操作更复杂） |
| **预计总时间（串行）** | 84 × 20 分钟 ≈ **28 小时** |
| **预计总时间（并行 10 个）** | ≈ **2.8 小时** |
| **API 成本估算** | 每个任务约 $1-3，总计 **$84-252** |

#### 推荐子集（先用轻量版验证）

| 评测集 | 完整版 | 轻量子集 | 运行时间 | API 成本 |
|--------|--------|----------|----------|----------|
| SWE-bench Verified | 500 任务 | **50-100 任务** | 1-2 小时 | $25-100 |
| Terminal-Bench v2 | 84 任务 | **20-30 任务** | 1 小时 | $20-90 |

**建议**：先用轻量子集验证流程，再跑完整版。

---

### 4.2 验证方法详解

#### 方案 A：使用官方评测框架（推荐）

##### 步骤 1：安装 SWE-bench 评测框架

```bash
# 创建虚拟环境
python3 -m venv swe-bench-env
source swe-bench-env/bin/activate

# 安装 SWE-bench
pip install swebench[full]

# 安装 Docker（必须，用于运行测试）
# macOS: brew install --cask docker
# 启动 Docker Desktop
```

##### 步骤 2：下载评测数据集

```bash
# 下载 SWE-bench Verified（500 个任务）
python -c "
from datasets import load_dataset
dataset = load_dataset('princeton-nlp/SWE-bench_Verified')
dataset.save_to_disk('swe-bench-verified')
"

# 或者只下载轻量子集（前 50 个）
python -c "
from datasets import load_dataset
dataset = load_dataset('princeton-nlp/SWE-bench_Verified', split='test')
subset = dataset.select(range(50))
subset.save_to_disk('swe-bench-verified-50')
"
```

##### 步骤 3：编写 Agent 适配器

SWE-bench 需要一个标准化的 Agent 接口：

```python
# my_agent_adapter.py
import json
from swebench import SWEBenchEvaluator

class MyAgent:
    def __init__(self, model="your-model", api_key="your-key"):
        self.model = model
        self.api_key = api_key
        # 初始化你的 Agent 核心
        self.agent_core = YourAgentCore()

    def solve(self, issue: dict) -> str:
        """
        核心方法：根据 Issue 描述生成代码修复
        
        Args:
            issue: {
                "repo": "django/django",
                "issue_description": "...",
                "base_commit": "abc123",
                "problem_statement": "..."
            }
        
        Returns:
            生成的补丁（diff 格式）
        """
        # 1. 获取代码库上下文
        repo_path = self.clone_repo(issue["repo"], issue["base_commit"])
        
        # 2. 调用你的 Agent 核心
        response = self.agent_core.solve(
            problem=issue["problem_statement"],
            repo_path=repo_path,
            context=self.collect_context(repo_path)
        )
        
        # 3. 返回 diff 格式的补丁
        return response["diff"]

    def clone_repo(self, repo: str, commit: str) -> str:
        # 克隆代码库到指定 commit
        import subprocess
        path = f"/tmp/repos/{repo.replace('/', '__')}"
        subprocess.run(["git", "clone", f"https://github.com/{repo}.git", path])
        subprocess.run(["git", "-C", path, "checkout", commit])
        return path

    def collect_context(self, repo_path: str) -> dict:
        # 收集代码库上下文（文件结构、相关代码等）
        return {
            "file_tree": self.get_file_tree(repo_path),
            "relevant_files": self.find_relevant_files(repo_path)
        }

# 运行评测
if __name__ == "__main__":
    agent = MyAgent()
    
    # 初始化评测器
    evaluator = SWEBenchEvaluator(
        dataset_path="swe-bench-verified-50",  # 轻量子集
        log_dir="results/"
    )
    
    # 运行评测
    results = evaluator.evaluate(
        agent=agent,
        num_workers=4,  # 并行 4 个任务
        run_id="my-agent-v1"
    )
    
    # 输出结果
    print(f"Pass@1: {results['pass@1']}")
    print(f"Resolved: {results['resolved_instances']}/{results['total_instances']}")
    
    # 保存详细结果
    with open("results/summary.json", "w") as f:
        json.dump(results, f, indent=2)
```

##### 步骤 4：运行评测

```bash
# 确保 Docker 已启动
docker info

# 运行轻量子集（50 个任务）
python my_agent_adapter.py

# 查看结果
cat results/summary.json
```

##### 步骤 5：提交到官方排行榜（可选）

```bash
# 安装 SWE-bench CLI
pip install swebench-cli

# 提交结果
sb-cli submit \
  --predictions-path results/predictions.json \
  --run-id my-agent-v1 \
  --model your-model-name
```

#### 方案 B：使用 EvalScope（更简单）

阿里巴巴 ModelScope 团队开发的评测框架，支持多种评测集。

##### 安装和使用

```bash
# 安装 EvalScope
pip install evalscope

# 评测 SWE-bench Verified（自动处理数据集和评测逻辑）
evalscope eval \
  --model your-model \
  --api-key your-key \
  --dataset swe-bench-verified \
  --limit 50 \
  --output-dir results/

# 查看结果
cat results/summary.json
```

**优点**：
- 配置简单，无需自己写适配器
- 支持多种模型（OpenAI API 兼容）
- 自动处理数据集下载和结果提交

**缺点**：
- 对自定义 Agent 的支持可能不如官方框架灵活

#### 方案 C：Terminal-Bench v2 验证方法

##### 安装和运行

```bash
# 克隆 Terminal-Bench 仓库
git clone https://github.com/laude-institute/terminal-bench.git
cd terminal-bench

# 安装依赖
pip install -e .

# 编写 Agent 适配器
# 需要实现：
# 1. 接收任务描述
# 2. 在终端环境中执行操作
# 3. 返回执行结果

# 运行评测
python run_eval.py \
  --agent your-agent \
  --tasks terminal-bench-2 \
  --num-workers 4 \
  --output results/
```

**关键接口**：

```python
class YourTerminalAgent:
    def solve(self, task: dict) -> list:
        """
        Args:
            task: {
                "instruction": "List all Python files in the current directory",
                "working_dir": "/path/to/dir"
            }
        
        Returns:
            执行的命令列表，例如：
            ["ls *.py", "grep -r 'import' *.py"]
        """
        # 调用你的 Agent 核心
        commands = self.agent_core.solve_task(
            instruction=task["instruction"],
            working_dir=task["working_dir"]
        )
        
        return commands
```

---

### 4.3 完整验证流程建议

#### 阶段一：快速验证（1 周）

```bash
# 1. 跑 HumanEval（2 小时）
evalscope eval --dataset humaneval --limit 50
# 目标：验证基础功能是否正常

# 2. 跑 SWE-bench Verified（轻量子集 50 个，1-2 天）
python my_agent_adapter.py --limit 50
# 目标：Pass@1 > 30%（及格线）
```

#### 阶段二：核心评测（2-3 周）

```bash
# 1. SWE-bench Verified（完整 500 个，需要并行）
python my_agent_adapter.py --num-workers 10
# 目标：Pass@1 > 60%

# 2. Terminal-Bench v2（84 个）
python run_terminal_bench.py --num-workers 4
# 目标：Pass@1 > 40%
```

#### 阶段三：持续跟踪（每月）

```bash
# 跑 SWE-bench Live（每月更新，防止数据污染）
python my_agent_adapter.py --dataset swe-bench-live
```

---

### 4.4 成本优化建议

#### 1. 使用缓存

```python
# 缓存 Agent 响应，避免重复调用
import sqlite3

class CachedAgent:
    def __init__(self, agent, cache_db="cache.db"):
        self.agent = agent
        self.conn = sqlite3.connect(cache_db)
        self.create_table()
    
    def solve(self, issue):
        # 先查缓存
        cached = self.get_from_cache(issue["instance_id"])
        if cached:
            return cached
        
        # 调用 Agent
        result = self.agent.solve(issue)
        
        # 存入缓存
        self.save_to_cache(issue["instance_id"], result)
        return result
```

#### 2. 使用更便宜的模型进行探索

```python
# 先用快速模型生成候选方案
draft_response = cheap_model.generate(prompt)

# 再用高端模型筛选和优化
final_response = expensive_model.refine(draft_response)
```

#### 3. 并行运行

```bash
# 使用 10 个并行 worker
python my_agent_adapter.py --num-workers 10
```

---

### 4.5 评测结果解读

| 指标 | 含义 | 目标 |
|------|------|------|
| **Pass@1** | 1 次尝试通过率 | 越高越好（>50% 优秀） |
| **Pass@k** | k 次尝试通过率 | 越高越好 |
| **Token 效率** | 完成任务的平均 token 数 | 越低越好 |
| **成本效率** | 完成任务的平均成本 | 越低越好 |
| **时间效率** | 完成任务的平均时间 | 越低越好 |
| **解决率** | 成功解决的任务比例 | 越高越好 |

---

## 五、竞争工具全面对标（5 款主流产品）

### 4.1 基本信息对比

| 工具 | 厂商 | 产品形态 | 发布时间 | 开源状态 | 定价策略 |
|------|------|----------|----------|----------|----------|
| **MiMo Code** | 小米 | 终端原生 AI 编程助手 | 2026-06（V0.1.0） | 类 MIT | 限时免费 + 极低 API 定价 |
| **Trae** | 字节跳动 | AI 原生 IDE | 2024-2025 | 闭源 | 订阅制 |
| **Qoder** | 阿里巴巴 | JetBrains IDE 插件 | 2025 | 闭源 | 企业版 + 免费版 |
| **Claude Code** | Anthropic | CLI + VS Code 扩展 | 2024-2025 | 闭源 | 按 Token 计费 |
| **Cursor** | Cursor Team | AI 原生 IDE | 2023-2024 | 闭源 | 订阅制（$20/月）|

### 4.2 SWE-bench Verified 排行榜（2026 年 6 月完整版）

| 排名 | 模型/Agent | 成绩 | 机构 | 发布时间 |
|------|------------|------|------|----------|
| 1 | Claude Opus 4.8 | **88.6%** | Anthropic | 2026-05 |
| 2 | Claude Opus 4.7 | **87.6%** | Anthropic | 2026-04 |
| 3 | Claude Opus 4.5 | **80.9%** | Anthropic | 2025-11 |
| 4 | DeepSeek-V4-Pro-Max | **80.6%** | DeepSeek | 2026-04 |
| 5 | Gemini 3.1 Pro | **80.6%** | Google | 2026-02 |
| 6 | Kimi K2.6 | **80.2%** | Moonshot | 2026-04 |
| 7 | GPT-5.2 | **80.0%** | OpenAI | 2025-12 |
| **-** | **MiMo Code（自报）** | **82%** | **Xiaomi** | **2026-06** |
| **-** | **Trae** | **75.2%** | **ByteDance** | **2025-07** |

**关键发现**：
- MiMo Code（框架 + MiMo-V2.5-Pro）自报 **82%**，暂时领先
- 框架本身带来 **约 4% 增益**（纯模型 78% → 框架 82%）

### 4.3 多维度评测集对标

| 工具 | SWE-bench Verified | SWE-bench Pro | Terminal-Bench 2 | 底层模型 |
|------|---------------------|----------------|---------------|----------|
| **MiMo Code** | **82%** | **62%** | **73%** | MiMo-V2.5-Pro |
| Claude Code | 79% | 55% | 69% | Claude Sonnet 4.6 |
| OpenAI Codex CLI | 未知 | 58.6% | **82.2%** | GPT-5.5 |
| Trae | 75.2% | 未知 | 未知 | 多模型集成 |
| **我们的目标（MVP）** | **60%+** | **40%+** | **40%+** | 待定 |
| **我们的目标（长期）** | **82%+** | **62%+** | **73%+** | 待定 |

**解读**：
- **SWE-bench Verified**：MiMo Code 目前最强（82%）
- **SWE-bench Pro**：MiMo Code 领先（62% vs OpenAI 58.6%）
- **Terminal-Bench 2**：OpenAI Codex CLI 最强（82.2%），MiMo Code 有提升空间（73%）

### 4.4 核心能力详细对比

| 能力维度 | MiMo Code | Trae | Qoder | Claude Code | Cursor |
|----------|------------|------|-------|-------------|--------|
| **AI 原生 IDE** | ✅ 终端原生 | ✅ | ✅ | ❌（CLI/扩展）| ✅ |
| **Chat 对话模式** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **项目生成 Builder** | ✅ Compose 模式 | ✅ Builder 模式 | ✅ Quest 模式 | ✅ | ❌ |
| **代码库理解** | ✅ | ✅ CKG 知识图谱 | ✅ 数据库 Schema 集成 | ✅ | ✅ RepoWiki |
| **长周期任务记忆** | ✅ **显式记忆架构** | ❌ | ❌ | ❌ | ❌ |
| **多文件修改** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **多模型支持** | ✅ 支持第三方 | ✅ | ❌（仅 Qwen）| ❌（仅 Anthropic）| ✅ |
| **语音控制** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **MCP 协议支持** | ✅ 兼容 Claude Code | ✅ | 未知 | ✅ | ✅ |
| **SWE-bench 成绩** | **82%** | 75.2% | 未知 | 79% | 未知 |
| **开源** | ✅（类 MIT）| ❌ | ❌ | ❌ | ❌ |

### 4.5 技术架构对比

#### MiMo Code（小米）
**核心创新**：
1. **显式记忆架构**：基于 SQLite FTS5 全文搜索的跨会话记忆系统
   - 四层记忆：项目记忆、会话检查点、草稿笔记、任务进度日志
   - 独立检查点写入器子代理（专职更新蓝图）
   - 自我改进机制：`/dream` 命令 + "蒸馏"功能
2. **框架增益**：同模型带来 +5% 提升
3. **Compose 模式**：Tab 键触发规范驱动工作流
4. **语音控制**：基于 MiMo-ASR 和 TenVAD 技术

**定价**：
- MiMo-V2.5：输入 $0.40/百万 Token，输出 $2.00
- 全球最便宜的顶尖模型之一

#### Trae（字节跳动）
**核心创新**：
1. **多模型集成生成**：Claude 3.7 Sonnet + Gemini 2.5 Pro + o4 mini
2. **Tester Agent 过滤**：基于回归测试过滤错误补丁
3. **Selector Agent 投票**：
   - 语法投票（AST 聚类）
   - 多轮选择投票
4. **Code Knowledge Graph**：构建代码知识图谱

**单模型成绩**：
- Claude 3.7 Sonnet：60.6% - 62.6%
- Gemini 2.5 Pro：52.4% - 55%
- OpenAI o4 mini：54.4% - 55.8%

#### Qoder（阿里巴巴）
**核心特点**：
1. **数据库 Schema 集成**：自动关联数据库 Schema，解决 AI 拿不到准确表结构的问题
2. **JetBrains IDE 深度集成**：支持 IntelliJ IDEA、PyCharm、GoLand、Android Studio
3. **Agentic 编码技术**：将 LLM 与开发环境深度融合
4. **Qoder 1.0**：从 AI IDE 升级为智能体自主开发工作台（2026-05）

**未知信息**：
- 无公开 SWE-bench 成绩数据
- 可能主要聚焦实际开发效率而非 benchmark 分数

#### Claude Code（Anthropic）
**核心特点**：
1. **Claude 原生集成**：最优的 Claude 模型调用体验
2. **终端原生**：直接在终端中运行，支持文件读写、命令执行、Git 管理
3. **MCP 协议支持**：可扩展工具生态
4. **高成绩**：Claude Opus 4.8 达到 88.6%

**限制**：
- 仅支持 Anthropic 模型
- 无显式记忆架构（长周期任务可能丢上下文）

#### Cursor（Cursor Team）
**核心特点**：
1. **AI 原生 IDE 先驱**：最早将 AI 深度集成到 IDE 的产品
2. **多模型支持**：支持 Claude、GPT、Gemini 等
3. **Glass 界面**：美观的 UI 设计
4. **多 Agent 并行**：支持并行运行多个 Agent

**限制**：
- 无公开 SWE-bench 成绩
- 订阅制定价（$20/月）

### 4.6 长周期任务能力对比

| 工具 | 长周期任务支持 | 记忆机制 | >200 步胜率 |
|------|----------------|----------|--------------|
| **MiMo Code** | ✅ **显式记忆架构** | SQLite FTS5 + 四层记忆 | **65%+** |
| Trae | ❌ | 无 | 未知 |
| Qoder | ❌ | 无 | 未知 |
| Claude Code | ❌ | 无 | 未知 |
| Cursor | ❌ | 无 | 未知 |

**关键结论**：MiMo Code 的显式记忆架构是**目前唯一的工业化解决方案**，其他工具在长周期任务上可能存在"失忆症"。

### 4.7 定价策略对比

| 工具 | 定价模式 | 价格（输入/输出 per M Token） | 免费额度 |
|------|----------|-----------------------------|----------|
| **MiMo Code** | API 按量计费 | $0.40 / $2.00（V2.5）<br>$1.00 / $3.00（V2.5-Pro） | 限时免费 |
| **Trae** | 订阅制 | 未知 | 未知 |
| **Qoder** | 企业版 + 免费版 | 未知 | 有免费版 |
| **Claude Code** | 按 Token 计费 | $3.00 / $15.00（Opus 4.5）<br>$0.30 / $1.50（Sonnet 4.6） | 无 |
| **Cursor** | 订阅制 | $20/月（Pro） | 有免费版 |

**结论**：MiMo Code 的定价最具侵略性，可能是为了快速获取市场份额。

---

## 六、MiMo Code 核心创新与启发

### 5.1 显式记忆架构（长周期任务核心）

**问题**：传统 AI 编程助手在长会话中因上下文窗口填满而丢失早期决策信息。

**MiMo 方案**：基于 SQLite FTS5 全文搜索的跨会话记忆系统

**四层记忆结构**：
1. **项目记忆**：持久化 MEMORY.md 文件
2. **会话检查点**：实时保存任务状态
3. **草稿笔记**：临时思路和方案
4. **任务进度日志**：详细执行记录

**核心创新**：
- 独立的"检查点写入器"子代理（类似专职建筑师实时更新蓝图）
- 主代理专注编码，子代理负责记忆管理
- 上下文接近极限时，从结构化检查点重建环境

**自我改进机制**：
- `/dream` 命令：定期回顾历史会话并压缩为长期记忆
- "蒸馏"功能：挖掘可自动化的重复工作流

**验证效果**：
- 人类双盲 A/B 测试：576 名开发者，1,213 组对决样本
- 短任务（<200 步）：两者胜率持平
- 长任务（>200 步）：**MiMo Code 胜率 65%+**

### 5.2 框架增益显著

**关键发现**：在运行相同 MiMo-V2.5-Pro 模型的情况下，MiMo Code 在 SWE-bench Pro 和 Terminal-Bench 2 上的得分均比 Claude Code 高出约 **5 个百分点**。

**说明**：Agent harness（编排框架）设计的重要性不亚于模型能力。

### 5.3 对我们的启发

| 创新点 | 技术实现 | 对我们的启发 |
|----------|------------|------------|
| **显式记忆架构** | SQLite FTS5 + 四层记忆 + 检查点写入器子代理 | **必须实现**，否则长周期任务会被碾压 |
| **框架增益** | 同模型 +5% 提升 | Harness 设计的重要性不亚于模型 |
| **Compose 模式** | Tab 键触发规范驱动工作流 | 可以参考，实现类似 Quest 模式 |
| **语音控制** | MiMo-ASR + TenVAD | 可选功能，非核心 |

---

## 七、实施路线图

### 阶段一：MVP 验证（4-8 周）

**目标**：验证 Agent 核心与 VS Code 的集成可行性

| 周次 | 任务 | 交付物 |
|------|------|--------|
| W1-2 | 初始化 VS Code 扩展项目，实现基础 Webview 聊天面板 | 扩展骨架 + Chat UI |
| W3-4 | 实现上下文收集、Agent 通信层、基础消息收发 | 端到端对话功能 |
| W5-6 | 实现行内对话、代码修改应用（Diff 预览） | 编辑器深度集成 |
| W7-8 | 实现流式响应、多文件修改、权限控制 | MVP 可用版本 |

### 阶段二：核心能力完善（6-8 周）

**目标**：达到可对标 Trae 早期版本（70.6%）的能力

| 任务 | 说明 |
|------|------|
| 代码库语义索引 | 参考 Aider 的 RepoMap 或 Trae 的 CKG |
| AGENTS.md 支持 | 项目级 Agent 配置 |
| 多模型支持 | 模型路由（推理用高端模型，简单任务用快速模型）|
| MCP 协议支持 | 扩展工具生态 |
| **显式记忆架构（参考 MiMo Code）** | **长周期任务的核心能力** |

### 阶段三：评测与迭代（持续）

**评测计划**：

```
第一批：快速验证（1 周）
  └── HumanEval（50 个样本）→ 验证基础功能

第二批：核心评测（2-3 周）
  ├── SWE-bench Verified（完整 500 个）
  └── Terminal-Bench v2（84 个）

第三批：持续跟踪（每月）
  ├── SWE-bench Live（防数据污染）
  └── 自家产品的真实任务集
```

**成绩目标**：
- 第一阶段目标：60%+（及格线）
- 第二阶段目标：70%+（对标 Trae 75.2%）
- 第三阶段目标：82%+（对标 MiMo Code）

---

## 八、关键技术决策

### 7.1 为什么不 Fork VS Code？

根据 EclipseSource 的深度分析（2024 年 12 月）：

**隐藏成本**：
1. **失去 VS Code 市场访问权**（违反 ToS）
2. **专有扩展无法使用**（Live Share、Remote Development、C++ 工具等）
3. **维护负担极大**：VS Code 每月更新，需要不断 rebase
4. **社区隔离**：遇到问题只能自己解决

**结论**：除非你需要修改 VS Code 核心渲染引擎，否则不推荐 Fork。

### 7.2 为什么选 Eclipse Theia 作为长期方案？

1. **供应商中立**：Eclipse 基金会管理，不会被单一厂商控制
2. **支持 VS Code 扩展**：可以运行大多数 VS Code 扩展
3. **深度定制能力**：不受 VS Code Extension API 限制
4. **有 AI 框架支持**：Theia AI 专门为 AI IDE 设计
5. **社区共同维护**：不需要自己 rebase

### 7.3 评测集为什么不选 Artificial Analysis Index？

- 太新（2025 年 5 月才推出），行业认可度还在建立中
- SWE-bench Verified + Terminal-Bench v2 已经覆盖其核心组成
- 可以先跑这两个，后续再补充到完整 Index

---

## 九、风险与建议

### 8.1 风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| SWE-bench 数据污染 | 成绩可能虚高 | 同时跑 SWE-bench Live（每月更新）|
| Agent 核心与 VS Code 扩展的通信延迟 | 用户体验下降 | 使用 WebSocket + 流式响应 |
| 评测成本高（API 调用） | 预算超支 | 先跑子集（50-100 个任务）|
| 与 Cursor/Trae 的功能差距大 | 竞争力不足 | 聚焦差异化（如显式记忆架构）|

### 8.2 建议

1. **快速启动**：先用 VS Code 扩展验证，2 个月内出 MVP
2. **对标评测**：同步跑 SWE-bench Verified，有数据才有说服力
3. **开源策略**：前端开源（建立社区），核心 Agent 闭源（保护竞争力）
4. **差异化**：不要全面对标 Cursor，找一个细分场景做深（如后端开发、数据库集成、长周期任务等）
5. **学习 MiMo Code**：显式记忆架构是必须实现的功能

---

## 十、参考资源

### 技术文档
- VS Code Extension API：https://code.visualstudio.com/api
- Eclipse Theia：https://theia-ide.org/docs/
- MCP 协议：https://modelcontextprotocol.io/

### 开源参考
- Cline：https://github.com/cline/cline
- Continue：https://github.com/continuedev/continue
- Aider：https://github.com/Aider-AI/aider
- Eclipse Theia：https://github.com/eclipse-theia/theia

### 评测集
- SWE-bench：https://github.com/swe-bench/SWE-bench
- Terminal-Bench：https://www.tbench.ai/
- Artificial Analysis：https://artificialanalysis.ai/agents/coding-agents
- EvalScope（评测框架）：https://github.com/modelscope/evalscope

### 排行榜
- SWE-bench Verified：https://leaderboard.steel.dev/leaderboards/swe-bench-verified/
- Artificial Analysis Coding Agents：https://artificialanalysis.ai/agents/coding-agents

### 竞品官方资源
- MiMo Code：https://news.qq.com/rain/a/20260612A02E2J00
- Trae：https://se-research.bytedance.com/blogs/trae-on-swe-bench-verified-71
- Qoder：https://qoder.com/
- Claude Code：https://www.anthropic.com/news/claude-opus-4-8
- Cursor：https://cursor.sh/

---

## 十一、总结

### 10.1 核心结论

1. **技术选型**：VS Code 扩展 → Eclipse Theia 渐进路线最优
2. **评测标准**：SWE-bench Verified + Terminal-Bench v2 是必须跑的
3. **竞争水位**：MiMo Code 目前最强（82%），但刚发布需要观察
4. **关键创新**：显式记忆架构是长周期任务的核心，必须实现
5. **框架重要性**：同模型，好的 harness 可以带来 +5% 提升

### 10.2 行动建议

| 优先级 | 行动 | 时间 |
|--------|------|------|
| **P0** | 启动 VS Code 扩展开发 | 本周 |
| **P0** | 搭建 SWE-bench Verified 评测环境 | 本周 |
| **P1** | 实现显式记忆架构（参考 MiMo Code）| 2 个月内 |
| **P1** | 跑通 MVP + 首次评测 | 2 个月内 |
| **P2** | 多模型支持 + MCP 协议 | 3 个月内 |
| **P2** | 对标 MiMo Code（82%）| 6 个月内 |

### 10.3 Benchmark 目标（更新版）

| 评测集 | 第一梯队成绩 | 我们的 MVP 目标 | 我们的长期目标 |
|---------|----------------|----------------|----------------|
| **SWE-bench Verified** | MiMo Code: 82% | 60%+ | **82%+** |
| **SWE-bench Pro** | MiMo Code: 62% | 40%+ | **62%+** |
| **Terminal-Bench v2** | OpenAI Codex: 82.2% | 40%+ | **73%+** |
| **长周期任务（>200 步）** | MiMo Code: 65% 胜率 | - | **60%+** |

---

**报告结束**

*本报告基于 2026 年 6 月 16 日的公开信息整理，部分数据来自官方博客和第三方评测机构，实际情况可能有变化。*
