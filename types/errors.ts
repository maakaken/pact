export interface ApiError {
  error: string;
  status?: number;
  details?: unknown;
}

export class AppError extends Error {
  constructor(
    message: string,
    public status: number = 500,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'error' in error &&
    typeof (error as ApiError).error === 'string'
  );
}

export function handleApiError(error: unknown): ApiError {
  if (isApiError(error)) {
    return error;
  }
  
  if (error instanceof AppError) {
    return { error: error.message, status: error.status, details: error.details };
  }
  
  if (error instanceof Error) {
    return { error: error.message, status: 500 };
  }
  
  return { error: 'An unknown error occurred', status: 500 };
}
