import {
  applyMiddleware,
  combineReducers,
  createStore,
  Store,
  Middleware,
} from "redux"
import _ from "lodash"

import { mett } from "../utils/mett"
import thunk, { ThunkMiddleware, ThunkDispatch } from "redux-thunk"
import reducers from "./reducers"
import { writeToCache, readFromCache } from "./persist"
import { IGatsbyState, ActionsUnion } from "./types"

// Create event emitter for actions
export const emitter = mett()

// Read old node data from cache.
export const readState = (): IGatsbyState => {
  try {
    const state = readFromCache() as IGatsbyState
    if (state.nodes) {
      // re-create nodesByType
      state.nodesByType = new Map()
      state.nodes.forEach(node => {
        const { type } = node.internal
        if (!state.nodesByType.has(type)) {
          state.nodesByType.set(type, new Map())
        }
        state.nodesByType.get(type)!.set(node.id, node)
      })
    }

    // jsonDataPaths was removed in the per-page-manifest
    // changes. Explicitly delete it here to cover case where user
    // runs gatsby the first time after upgrading.
    delete state[`jsonDataPaths`]
    return state
  } catch (e) {
    // ignore errors.
  }
  // BUG: Would this not cause downstream bugs? seems likely. Why wouldn't we just
  // throw and kill the program?
  return {} as IGatsbyState
}

/**
 * Redux middleware handling array of actions
 */
const multi: Middleware = ({ dispatch }) => next => (
  action: ActionsUnion
): ActionsUnion | ActionsUnion[] =>
  Array.isArray(action) ? action.filter(Boolean).map(dispatch) : next(action)

export type GatsbyReduxStore = Store<IGatsbyState, ActionsUnion> & {
  dispatch: ThunkDispatch<IGatsbyState, undefined, ActionsUnion>
}

export const configureStore = (initialState: IGatsbyState): GatsbyReduxStore =>
  createStore(
    combineReducers<IGatsbyState>({ ...reducers }),
    initialState,
    applyMiddleware(thunk as ThunkMiddleware<IGatsbyState, ActionsUnion>, multi)
  )

export const store: GatsbyReduxStore = configureStore(readState())

// Persist state.
export const saveState = (): void => {
  const state = store.getState()

  return writeToCache({
    nodes: state.nodes,
    status: state.status,
    componentDataDependencies: state.componentDataDependencies,
    components: state.components,
    jobsV2: state.jobsV2,
    staticQueryComponents: state.staticQueryComponents,
    webpackCompilationHash: state.webpackCompilationHash,
    pageDataStats: state.pageDataStats,
    pageData: state.pageData,
    modules: state.modules,
    queryModuleDependencies: state.queryModuleDependencies,
    // pages: state.pages,
    pendingPageDataWrites: state.pendingPageDataWrites,
    staticQueriesByTemplate: state.staticQueriesByTemplate,
  })
}

store.subscribe(() => {
  // const state = store.getState()
  const { lastAction, modules, queryModuleDependencies } = store.getState()

  // if ([`CREATE_MODULE_DEPENDENCY`, `DELETE_COMPONENTS_DEPENDENCIES`, `REGISTER_MODULE`].includes(lastAction.type)) {
  //   console.log(require(`util`).inspect({
  //     action: lastAction.type,
  //     modules, queryModuleDependencies
  //   }, { depth: null, color: true }))
  // }

  emitter.emit(lastAction.type, lastAction)
})
