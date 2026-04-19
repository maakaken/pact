// Deno type declarations for IDE support
declare global {
  namespace Deno {
    export namespace env {
      export function get(key: string): string | undefined;
    }
    export function serve(handler: (request: Request) => Promise<Response>): void;
  }
}

export {};
