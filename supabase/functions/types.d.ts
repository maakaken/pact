// Deno type declarations for IDE support
declare global {
  namespace Deno {
    export namespace env {
      export function get(key: string): string | undefined;
    }
    export function serve(handler: (request: Request) => Promise<Response>): void;
  }
}

// Module declarations for Deno imports
declare module 'https://deno.land/std@0.168.0/http/server.ts' {
  export function serve(handler: (request: Request) => Promise<Response>): void;
}

declare module 'https://esm.sh/@supabase/supabase-js@2' {
  export function createClient(url: string, key: string): any;
}

export {};
