import { AsyncLocalStorage } from 'node:async_hooks';
import type { LLMConfig } from '../llm/types.js';

export interface ToolRuntimeContext {
  config: LLMConfig;
}

const toolRuntimeStorage = new AsyncLocalStorage<ToolRuntimeContext>();

export function runWithToolRuntimeContext<T>(
  context: ToolRuntimeContext,
  fn: () => T | Promise<T>,
): T | Promise<T> {
  return toolRuntimeStorage.run(context, fn);
}

export function getToolRuntimeContext(): ToolRuntimeContext | undefined {
  return toolRuntimeStorage.getStore();
}
