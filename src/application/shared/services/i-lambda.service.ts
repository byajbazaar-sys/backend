export const LAMBDA_SERVICE = 'ILambdaService';

export interface ILambdaService {
  invokeLambda(functionName: string, payload: any): Promise<any>;
}
