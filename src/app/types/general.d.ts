type ErrorHandler = (error: unknown) => void;

type DebugHandler = (...args: unknown[]) => void;

type BasicValue = string | number | boolean | BasicValue[] | { [p: string]: BasicValue };

type BasicObject = Record<string, BasicValue>;

type Stringable = { toString(): string };

type Awaitable<T> = PromiseLike<T> | T;

type Mutable<T> = { -readonly [P in keyof T]: T[P] };

type DeepMutable<T> = T extends Function | Date | Error | RegExp ? T : { -readonly [P in keyof T]: DeepMutable<T[P]> };

type DeepReadonly<T> = T extends Function | Date | Error | RegExp ? T : { readonly [P in keyof T]: DeepReadonly<T[P]> };

type DeepRequired<T> = T extends Function | Date | Error | RegExp ? T : { [P in keyof T]-?: DeepRequired<T[P]> };

type DeepPartial<T> = T extends Function | Date | Error | RegExp ? T : { [P in keyof T]?: DeepPartial<T[P]> };
