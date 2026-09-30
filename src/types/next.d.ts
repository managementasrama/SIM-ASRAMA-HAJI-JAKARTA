// Ambient type definitions for Next.js helpers to allow Next.js server/middleware utility files
// to typecheck cleanly in this Vite/React environment.

declare module 'next/headers' {
  export function cookies(): Promise<{
    getAll(): { name: string; value: string }[];
    set(name: string, value: string, options?: any): void;
  }>;
}

declare module 'next/server' {
  export interface NextRequest {
    headers: Headers;
    cookies: {
      getAll(): { name: string; value: string }[];
      set(name: string, value: string): void;
    };
  }
  export class NextResponse {
    static next(init?: { request?: any }): NextResponse;
    cookies: {
      set(name: string, value: string, options?: any): void;
    };
  }
}
