export interface AppContext {
	get<T>(key: new (...args: any[]) => T): T;
}