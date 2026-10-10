import { AsyncLocalStorage } from "node:async_hooks";
import type { ExecutionContext, ExecutionContextProvider } from "../index.js";

export class AsyncExecutionContext implements ExecutionContextProvider {
  private readonly storage = new AsyncLocalStorage<ExecutionContext>();

  current(): ExecutionContext | undefined {
    return this.storage.getStore();
  }

  run<T>(context: ExecutionContext, operation: () => T): T {
    return this.storage.run(Object.freeze({ ...context }), operation);
  }
}
