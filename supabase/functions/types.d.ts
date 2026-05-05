// Deno type declarations for IDE support

declare global {
  const Deno: {
    env: {
      get(key: string): string | undefined;
    };
    serve(handler: (request: Request) => Response | Promise<Response>): void;
  };
}

declare module 'https://deno.land/std@0.168.0/http/server.ts' {
  export function serve(handler: (request: Request) => Promise<Response>): void;
}

declare module 'https://esm.sh/@supabase/supabase-js@2' {
  interface SupabaseClient {
    from: (table: string) => any;
    auth: any;
  }
  export function createClient(url: string, key: string): SupabaseClient;
}

export {};
