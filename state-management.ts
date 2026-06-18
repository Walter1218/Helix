type Action<T extends string = string, P = void> = P extends void
  ? { readonly type: T }
  : { readonly type: T; readonly payload: P }

type Reducer<S, A extends Action> = (state: S, action: A) => S

type Listener = () => void

type Middleware<S, A extends Action> = (
  store: Pick<Store<S, A>, "getState" | "dispatch">
) => (next: Dispatch<A>) => (action: A) => A

type Dispatch<A extends Action> = (action: A) => A

interface Store<S, A extends Action> {
  getState(): S
  dispatch: Dispatch<A>
  subscribe(listener: Listener): () => void
  replaceReducer(nextReducer: Reducer<S, A>): void
}

const createStore = <S, A extends Action>(
  reducer: Reducer<S, A>,
  initialState: S,
  middlewares: ReadonlyArray<Middleware<S, A>> = []
): Store<S, A> => {
  let state = initialState
  let currentReducer = reducer
  const listeners = new Set<Listener>()

  const getState = () => state

  const baseDispatch: Dispatch<A> = (action) => {
    state = currentReducer(state, action)
    listeners.forEach((fn) => fn())
    return action
  }

  const dispatch: Dispatch<A> =
    middlewares.length === 0
      ? baseDispatch
      : middlewares.reduceRight<Dispatch<A>>(
          (next, middleware) => middleware({ getState, dispatch })(next),
          baseDispatch
        )

  const subscribe = (listener: Listener): (() => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  const replaceReducer = (nextReducer: Reducer<S, A>): void => {
    currentReducer = nextReducer
  }

  return { getState, dispatch, subscribe, replaceReducer }
}

const combineReducers = <S extends Record<string, unknown>>(
  reducers: { [K in keyof S]: Reducer<S[K], Action> }
): Reducer<S, Action> => {
  const keys = Object.keys(reducers) as Array<keyof S>
  return (state, action) => {
    let hasChanged = false
    const nextState = {} as S
    for (const key of keys) {
      const previousStateForKey = state[key]
      const nextStateForKey = reducers[key](previousStateForKey, action)
      nextState[key] = nextStateForKey
      hasChanged = hasChanged || nextStateForKey !== previousStateForKey
    }
    return hasChanged ? nextState : state
  }
}

const compose = <T>(...fns: ReadonlyArray<(arg: T) => T>): ((arg: T) => T) =>
  fns.reduce((a, b) => (x) => a(b(x)), (x: T) => x)

const createAction = <T extends string, P = void>(
  type: T
): (payload: P) => Action<T, P> =>
  ((payload: P) => (payload === undefined ? { type } : { type, payload })) as (
    payload: P
  ) => Action<T, P>

const thunk =
  <S, A extends Action>(): Middleware<S, A> =>
  ({ dispatch, getState }) =>
  (next) =>
  (action) => {
    if (typeof action === "function") {
      return (action as (dispatch: Dispatch<A>, getState: () => S) => unknown)(
        dispatch,
        getState
      )
    }
    return next(action)
  }

const logger =
  <S, A extends Action>(): Middleware<S, A> =>
  ({ getState }) =>
  (next) =>
  (action) => {
    console.group(action.type)
    console.log("prev state:", getState())
    const result = next(action)
    console.log("next state:", getState())
    console.groupEnd()
    return result
  }

export type { Action, Reducer, Listener, Middleware, Dispatch, Store }
export { createStore, combineReducers, compose, createAction, thunk, logger }
