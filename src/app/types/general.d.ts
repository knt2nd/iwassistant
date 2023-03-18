type ErrorHandler = (error: unknown) => void;

type DebugHandler = (...args: unknown[]) => void;

type BasicValue = string | number | boolean | BasicValue[] | { [p: string]: BasicValue };

type BasicObject = Record<string, BasicValue>;

type Stringable = { toString(): string };

type Awaitable<T> = PromiseLike<T> | T;

type Immutable<T> = T extends Function | Date | Error | RegExp ? T : { readonly [P in keyof T]: Immutable<T[P]> };

type Mutable<T> = T extends Function | Date | Error | RegExp ? T : { -readonly [P in keyof T]: Mutable<T[P]> };

type DeepRequired<T> = T extends Function | Date | Error | RegExp ? T : { [P in keyof T]-?: DeepRequired<T[P]> };

type DeepPartial<T> = T extends Function | Date | Error | RegExp ? T : { [P in keyof T]?: DeepPartial<T[P]> };
