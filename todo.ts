interface Todo {
  id: number
  text: string
  completed: boolean
}

let todos: Todo[] = []
let nextId = 1

export function addTodo(text: string): Todo {
  const todo: Todo = { id: nextId++, text, completed: false }
  todos.push(todo)
  return todo
}

export function removeTodo(id: number): boolean {
  const index = todos.findIndex(t => t.id === id)
  if (index === -1) return false
  todos.splice(index, 1)
  return true
}

export function getTodos(): Todo[] {
  return [...todos]
}
