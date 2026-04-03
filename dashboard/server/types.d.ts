declare module 'express' {
  import type { IncomingMessage, ServerResponse } from 'http';

  interface Request extends IncomingMessage {
    body: any;
    params: Record<string, string>;
    query: Record<string, string | string[] | undefined>;
    cookies: Record<string, string>;
    path: string;
    method: string;
  }

  interface Response extends ServerResponse {
    json(body: unknown): Response;
    status(code: number): Response;
    send(body?: unknown): Response;
    cookie(name: string, val: string, options?: Record<string, unknown>): Response;
    clearCookie(name: string, options?: Record<string, unknown>): Response;
  }

  type NextFunction = (err?: any) => void;
  type RequestHandler = (req: Request, res: Response, next: NextFunction) => void;

  interface Application {
    (req: IncomingMessage, res: ServerResponse): void;
    use(...handlers: any[]): Application;
    get(path: string, ...handlers: RequestHandler[]): Application;
    post(path: string, ...handlers: RequestHandler[]): Application;
    put(path: string, ...handlers: RequestHandler[]): Application;
    delete(path: string, ...handlers: RequestHandler[]): Application;
    patch(path: string, ...handlers: RequestHandler[]): Application;
    listen(port: number, callback?: () => void): any;
  }

  interface Express {
    (): Application;
    json(options?: Record<string, unknown>): RequestHandler;
    urlencoded(options?: Record<string, unknown>): RequestHandler;
    static(root: string, options?: Record<string, unknown>): RequestHandler;
  }

  const express: Express;
  export default express;
  export { Request, Response, NextFunction, RequestHandler, Application };
}

declare module 'cors' {
  function cors(options?: Record<string, unknown>): any;
  export default cors;
}

declare module 'cookie-parser' {
  function cookieParser(secret?: string, options?: Record<string, unknown>): any;
  export default cookieParser;
}

declare module 'ws' {
  import type { Server } from 'http';
  import { EventEmitter } from 'events';

  class WebSocket extends EventEmitter {
    static readonly OPEN: number;
    static readonly CLOSED: number;
    readonly readyState: number;
    send(data: string | Buffer): void;
    close(): void;
    on(event: 'message', listener: (data: Buffer) => void): this;
    on(event: 'close', listener: () => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
  }

  class WebSocketServer extends EventEmitter {
    clients: Set<WebSocket>;
    constructor(options: { server: Server } | { port: number });
    on(event: 'connection', listener: (ws: WebSocket) => void): this;
    close(): void;
  }

  export { WebSocket, WebSocketServer };
}
