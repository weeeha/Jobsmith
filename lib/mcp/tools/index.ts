import type { ToolDefinition } from "../registry";
import { listJobs } from "./list-jobs";
import { getJob } from "./get-job";
import { getJobContext } from "./get-job-context";

// Tasks 7, 8, 11 and 24 add one entry per tool module.
export const TOOLS: ToolDefinition[] = [listJobs, getJob, getJobContext] as unknown as ToolDefinition[];
