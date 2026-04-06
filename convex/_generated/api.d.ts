/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as artifacts from "../artifacts.js";
import type * as checkObservations from "../checkObservations.js";
import type * as githubEvents from "../githubEvents.js";
import type * as pollState from "../pollState.js";
import type * as prRuns from "../prRuns.js";
import type * as pullRequests from "../pullRequests.js";
import type * as repoPolicies from "../repoPolicies.js";
import type * as repos from "../repos.js";
import type * as reviewThreads from "../reviewThreads.js";
import type * as reviewerRuns from "../reviewerRuns.js";
import type * as threadDecisions from "../threadDecisions.js";
import type * as ui from "../ui.js";
import type * as workflowErrors from "../workflowErrors.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  artifacts: typeof artifacts;
  checkObservations: typeof checkObservations;
  githubEvents: typeof githubEvents;
  pollState: typeof pollState;
  prRuns: typeof prRuns;
  pullRequests: typeof pullRequests;
  repoPolicies: typeof repoPolicies;
  repos: typeof repos;
  reviewThreads: typeof reviewThreads;
  reviewerRuns: typeof reviewerRuns;
  threadDecisions: typeof threadDecisions;
  ui: typeof ui;
  workflowErrors: typeof workflowErrors;
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
