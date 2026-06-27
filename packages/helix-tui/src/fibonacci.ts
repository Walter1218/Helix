function fibonacci(n: number): number {
  if (n <= 0) return 0
  if (n === 1) return 1
  return fibonacci(n - 1) + fibonacci(n - 2)
}

function fibonacciWhile(n: number): number {
  if (n <= 0) return 0
  if (n === 1) return 1
  
  let prev = 0
  let curr = 1
  let i = 2
  
  while (i <= n) {
    const next = prev + curr
    prev = curr
    curr = next
    i++
  }
  
  return curr
}

export { fibonacci, fibonacciWhile }
export default fibonacci
