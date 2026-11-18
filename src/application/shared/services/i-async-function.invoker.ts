export const ASYNC_FUNCTION_INVOKER = 'IAsyncFunctionInvoker';

/** Starts another serverless function in the background with a JSON payload (does not wait for it). */
export interface IAsyncFunctionInvoker {
  invoke(functionName: string, payload: unknown): Promise<void>;
}
