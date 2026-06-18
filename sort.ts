export function sortNumbers(arr: number[]): number[] {
  return [...arr].sort((a, b) => a - b)
}