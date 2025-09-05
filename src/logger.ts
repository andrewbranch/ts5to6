import chalk from "chalk";

/**
 * Simple logger with colored output for the CLI
 */
export class Logger {
  private indent = 0;

  info(message: string): void {
    console.log(this.getIndent() + chalk.blue("ℹ") + " " + message);
  }

  success(message: string): void {
    console.log(this.getIndent() + chalk.green("✓") + " " + message);
  }

  warn(message: string): void {
    console.log(this.getIndent() + chalk.yellow("⚠") + " " + message);
  }

  error(message: string): void {
    console.error(this.getIndent() + chalk.red("✗") + " " + message);
  }

  step(message: string): void {
    console.log(this.getIndent() + chalk.cyan("→") + " " + message);
  }

  heading(message: string): void {
    console.log();
    console.log(chalk.bold.blue(message));
    console.log(chalk.blue("=".repeat(message.length)));
  }

  subheading(message: string): void {
    console.log();
    console.log(chalk.bold(message));
  }

  list(items: string[]): void {
    for (const item of items) {
      console.log(this.getIndent() + "  • " + item);
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

export const logger = new Logger();
