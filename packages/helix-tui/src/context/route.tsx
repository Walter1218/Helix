import { createStore, reconcile } from "solid-js/store"
import { createMemo, type Accessor } from "solid-js"
import { createSimpleContext } from "./helper"

export type HomeRoute = {
  type: "home"
}

export type ChatRoute = {
  type: "chat"
  sessionID?: string
}

export type ProjectRoute = {
  type: "project"
  projectID?: string
}

export type MonitorRoute = {
  type: "monitor"
  metric?: string
}

export type SettingsRoute = {
  type: "settings"
  section?: string
}

export type PluginRoute = {
  type: "plugin"
  id: string
  data?: Record<string, unknown>
}

export type Route =
  | HomeRoute
  | ChatRoute
  | ProjectRoute
  | MonitorRoute
  | SettingsRoute
  | PluginRoute

export const { use: useRoute, provider: RouteProvider } = createSimpleContext({
  name: "Route",
  init: (props: { initialRoute?: Route }) => {
    const [store, setStore] = createStore<Route>(
      props.initialRoute ?? {
        type: "home",
      },
    )

    return {
      get data() {
        return store
      },
      navigate(route: Route) {
        setStore(reconcile(route))
      },
    }
  },
})

export type RouteContext = ReturnType<typeof useRoute>

export function useRouteData<T extends Route["type"]>(type: T) {
  const route = useRoute()
  return route.data as Extract<Route, { type: typeof type }>
}

export function useCurrentRouteType(): Accessor<Route["type"]> {
  const route = useRoute()
  return createMemo(() => route.data.type)
}
