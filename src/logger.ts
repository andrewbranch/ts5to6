import chalk from "chalk";

/**
 * Simple logger with colored output for the CLI
 */
export class Logger {
  private indent = 0;
  private writeLn: (msg: any) => void;

  constructor(write: (msg: any) => void) {
    this.writeLn = write;
  }

  info(message: string): void {
    this.writeLn(this.getIndent() + chalk.blue("ℹ") + " " + message);
  }

  success(message: string): void {
    this.writeLn(this.getIndent() + chalk.green("✓") + " " + message);
  }

  warn(message: string): void {
    this.writeLn(this.getIndent() + chalk.yellow("⚠") + " " + message);
  }

  error(message: string): void {
    this.writeLn(this.getIndent() + chalk.red("✗") + " " + message);
  }

  step(message: string): void {
    this.writeLn(this.getIndent() + chalk.cyan("→") + " " + message);
  }

  heading(message: string): void {
    this.writeLn("\n" + chalk.bold.blue(message));
    this.writeLn(chalk.blue("=".repeat(message.length)));
  }

  subheading(message: string): void {
    this.writeLn("\n" + chalk.bold(message));
  }

  list(items: string[]): void {
    for (const item of items) {
      this.writeLn(this.getIndent() + "  • " + item);
    }
  }

  code(text: string): string {
    return chalk.dim.cyan(text);
  }

  file(path: string): string {
    return chalk.green(path);
  }

  number(value: number): string {
    return chalk.yellow(value.toString());
  }

  withIndent<T>(fn: () => T): T {
    this.indent += 2;
    try {
      return fn();
    } finally {
      this.indent -= 2;
    }
  }

  private getIndent(): string {
    return " ".repeat(this.indent);
  }
}
