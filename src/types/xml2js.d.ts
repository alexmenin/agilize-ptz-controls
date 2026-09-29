declare module "xml2js" {
  export function parseStringPromise(
    xml: string,
    options?: Record<string, unknown>,
  ): Promise<unknown>;
}
