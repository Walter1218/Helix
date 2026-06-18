import { createSignal } from "solid-js"
import type { FileChange, Checkpoint } from "@/pages/session/checkpoint-panel"

const mockChanges: FileChange[] = [
  {
    id: "change-1",
    path: "src/calc.ts",
    type: "modified",
    additions: 12,
    deletions: 5,
    checked: true,
    diff: `@@ -1,5 +1,12 @@
-export function sum(a: number, b: number) {
-  return a + b
+export function add(a: number, b: number) {
+  return a + b
 }
+
+export function subtract(a: number, b: number) {
+  return a - b
+}
+
+export function multiply(a: number, b: number) {
+  return a * b
+}`,
  },
  {
    id: "change-2",
    path: "tests/calc.test.ts",
    type: "added",
    additions: 8,
    deletions: 0,
    checked: true,
    diff: `@@ -0,0 +1,8 @@
+import { add, subtract, multiply } from "../src/calc"
+
+test("add", () => {
+  expect(add(1, 2)).toBe(3)
+})
+
+test("subtract", () => {
+  expect(subtract(5, 3)).toBe(2)
+})`,
  },
  {
    id: "change-3",
    path: "package.json",
    type: "modified",
    additions: 3,
    deletions: 1,
    checked: false,
    diff: `@@ -10,5 +10,7 @@
   "dependencies": {
-    "lodash": "^4.17.21"
+    "lodash": "^4.17.21",
+    "jest": "^29.0.0",
+    "@types/jest": "^29.0.0"
   }`,
  },
]

const mockCheckpoints: Checkpoint[] = [
  {
    id: "cp-1",
    number: 1,
    timestamp: "2026-06-17 10:00",
    fileCount: 2,
    operator: "agent",
    description: "初始架构调整",
    files: [mockChanges[0]],
  },
  {
    id: "cp-2",
    number: 2,
    timestamp: "2026-06-17 10:30",
    fileCount: 3,
    operator: "agent",
    description: "添加测试框架",
    files: [mockChanges[0], mockChanges[1]],
  },
  {
    id: "cp-3",
    number: 3,
    timestamp: "2026-06-17 11:00",
    fileCount: 3,
    operator: "user",
    description: "手动保存",
    files: mockChanges,
  },
]

export function createMockCheckpointService() {
  const [changes, setChanges] = createSignal<FileChange[]>(mockChanges)
  const [staged, setStaged] = createSignal<FileChange[]>([])
  const [checkpoints, setCheckpoints] = createSignal<Checkpoint[]>(mockCheckpoints)

  const keep = (id: string) => {
    setChanges((prev) => prev.filter((c) => c.id !== id))
  }

  const revert = (id: string) => {
    setChanges((prev) => prev.filter((c) => c.id !== id))
  }

  const stage = (id: string) => {
    const file = changes().find((c) => c.id === id)
    if (!file) return
    setChanges((prev) => prev.filter((c) => c.id !== id))
    setStaged((prev) => [...prev, { ...file, checked: true }])
  }

  const unstage = (id: string) => {
    const file = staged().find((c) => c.id === id)
    if (!file) return
    setStaged((prev) => prev.filter((c) => c.id !== id))
    setChanges((prev) => [...prev, { ...file, checked: false }])
  }

  const acceptAll = () => setChanges([])
  const revertAll = () => setChanges([])
  const commit = () => {
    setStaged([])
  }

  const createCheckpoint = (description?: string) => {
    const next = checkpoints().length + 1
    const cp: Checkpoint = {
      id: `cp-${next}`,
      number: next,
      timestamp: new Date().toLocaleString(),
      fileCount: changes().length,
      operator: "user",
      description,
      files: [...changes()],
    }
    setCheckpoints((prev) => [...prev, cp])
  }

  const restoreCheckpoint = (id: string) => {
    const cp = checkpoints().find((c) => c.id === id)
    if (cp) {
      setChanges([...cp.files])
      setStaged([])
    }
  }

  return {
    changes,
    staged,
    checkpoints,
    keep,
    revert,
    stage,
    unstage,
    acceptAll,
    revertAll,
    commit,
    createCheckpoint,
    restoreCheckpoint,
  }
}
