/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agent from "../agent.js";
import type * as criteria from "../criteria.js";
import type * as decisions from "../decisions.js";
import type * as emailHandler from "../emailHandler.js";
import type * as employees from "../employees.js";
import type * as messages from "../messages.js";
import type * as workerRunner from "../workerRunner.js";
import type * as workerTasks from "../workerTasks.js";
import type * as workerTemplates from "../workerTemplates.js";
import type * as workers from "../workers.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agent: typeof agent;
  criteria: typeof criteria;
  decisions: typeof decisions;
  emailHandler: typeof emailHandler;
  employees: typeof employees;
  messages: typeof messages;
  workerRunner: typeof workerRunner;
  workerTasks: typeof workerTasks;
  workerTemplates: typeof workerTemplates;
  workers: typeof workers;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
