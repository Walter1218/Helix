/**
 * Max 模式候选评分
 *
 * 对 Max 模式生成的多个候选执行多维度评分，选择最优候选。
 * 评分维度：Judge approved(40%) + 文件数(20%) + 测试通过率(30%) + 风格一致性(10%)
 *
 * @module session/candidate-scorer
 */

import type { ReviewResult } from "@/agent/judge-agent"

export interface MaxCandidate {
  diff: string
  changedFiles: string[]
  [key: string]: unknown
}

export interface TestResult {
  passed: boolean
}

export interface CandidateDimensions {
  judgeApproved: boolean
  judgeScore: number
  fileCount: number
  fileScore: number
  testPassRate: number
  styleConsistency: number
}

export interface CandidateScore {
  candidate: MaxCandidate
  totalScore: number
  dimensions: CandidateDimensions
}

export const WEIGHTS = {
  judge: 0.40,
  fileCount: 0.20,
  testPassRate: 0.30,
  styleConsistency: 0.10,
}

/**
 * 计算代码风格一致性（简化实现）
 */
function calculateStyleConsistency(_code: string, _existingStyle: unknown): number {
  // 简化实现：返回固定值
  // 实际应比较缩进风格、命名约定、import 风格等
  return 0.8
}

/**
 * 对单个候选进行评分
 */
export function scoreCandidate(
  candidate: MaxCandidate,
  judgeReview: ReviewResult,
  testResults: TestResult[],
  existingCodeStyle: unknown = {}
): CandidateScore {
  // 1. Judge 评分
  const judgeScore = judgeReview.approved ? 1.0 :
    Math.max(0, 1.0 - Math.max(1, judgeReview.suggestions?.length ?? 1) * 0.2)

  // 2. 文件数评分（越少越好，最少为 1）
  const fileCount = candidate.changedFiles.length
  const fileScore = Math.max(0, 1.0 - Math.max(0, fileCount - 1) * 0.15)

  // 3. 测试通过率
  const passedTests = testResults.filter(t => t.passed).length
  const testPassRate = testResults.length > 0 ? passedTests / testResults.length : 0.5

  // 4. 代码风格一致性
  const styleConsistency = calculateStyleConsistency(candidate.diff, existingCodeStyle)

  // 加权总分
  const totalScore =
    judgeScore * WEIGHTS.judge +
    fileScore * WEIGHTS.fileCount +
    testPassRate * WEIGHTS.testPassRate +
    styleConsistency * WEIGHTS.styleConsistency

  return {
    candidate,
    totalScore,
    dimensions: {
      judgeApproved: judgeReview.approved,
      judgeScore,
      fileCount,
      fileScore,
      testPassRate,
      styleConsistency,
    },
  }
}

/**
 * 对多个候选进行评分并选择最优
 */
export function selectBestCandidate(
  candidates: MaxCandidate[],
  judgeReviews: ReviewResult[],
  testResults: TestResult[],
  existingCodeStyle: unknown = {}
): CandidateScore | undefined {
  if (candidates.length === 0) return undefined

  const scores = candidates.map((candidate, i) =>
    scoreCandidate(candidate, judgeReviews[i], testResults, existingCodeStyle)
  )

  return scores.sort((a, b) => b.totalScore - a.totalScore)[0]
}

export * as CandidateScorer from "./candidate-scorer"
