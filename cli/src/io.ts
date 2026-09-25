export type CliIo = {
  fetch: typeof fetch;
  env: Record<string, string | undefined>;
  cwd: string;
  homedir: string;
  stdout(text: string): void;
  stderr(text: string): void;
  readSecret(prompt: string): Promise<string>;
};
