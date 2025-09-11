#!/usr/bin/env -S node --experimental-strip-types

import chalk from "chalk";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { Logger } from "./logger.ts";
import fixBaseURL from "./main.ts";

// Declarative option (flag) definition
interface OptionDescriptor {
  name: string; // long form e.g. 'help'
  short?: string; // short form e.g. 'h'
  type: "boolean" | "string"; // util.parseArgs option type
  description: string; // help text
  hidden?: boolean; // omit from help (reserved / internal)
}

// Future extensibility: basic command abstraction (not yet used for subcommands)
interface CommandSpec {
  name: string; // command name ('' for root)
  description: string; // one-line summary
  options: OptionDescriptor[]; // command-scoped options
  run(context: RunContext): Promise<number> | number;
}

interface RunContext {
  values: Record<string, any>;
  positionals: string[];
  pkg: { name: string; version: string };
}

// Root command (expand later with subcommands by adding entries to commands array)
const rootCommand: CommandSpec = {
  name: "",
  description: "Migrate TypeScript projects away from baseUrl usage",
  options: [
    { name: "help", short: "h", type: "boolean", description: "Show help and usage information" },
    { name: "version", short: "v", type: "boolean", description: "Show the version number" },
  ],
  run: async ({ positionals }) => {
    // Placeholder business logic; show help if nothing supplied for now.
    if (positionals.length === 0) return printHelpAndReturn(0);

    try {
      await fixBaseURL(positionals[0]);
      return 0;
    } catch (error) {
      new Logger((msg) => console.log(msg)).error(
        `Failed to migrate project: ${error instanceof Error ? error.message : String(error)}`,
      );
      return 1;
    }
  },
};

const commands: CommandSpec[] = [rootCommand];

function resolveCommand(name: string | undefined): CommandSpec | undefined {
  if (!name) return rootCommand;
  return commands.find(c => c.name === name);
}

function buildParseConfig(command: CommandSpec) {
  const options: Record<string, { type: "boolean" | "string"; short?: string }> = {};
  for (const o of command.options) {
    options[o.name] = { type: o.type, short: o.short };
  }
  return { options, allowPositionals: true } as const;
}

function getPackageJson(): { name: string; version: string } {
  const pkgPath = fileURLToPath(new URL("../package.json", import.meta.url));
  const json = JSON.parse(readFileSync(pkgPath, "utf8"));
  return { name: json.name, version: json.version };
}

function formatOptions(options: OptionDescriptor[]): string[] {
  const visible = options.filter(o => !o.hidden);
  const summarized = visible.map(o => {
    const forms: string[] = [`--${o.name}`];
    if (o.short) forms.push(`-${o.short}`);
    return { forms: forms.join(", "), description: o.description };
  });
  const pad = Math.max(...summarized.map(s => s.forms.length), 0) + 2;
  return summarized.map(s => "  " + s.forms.padEnd(pad) + s.description);
}

function renderHelp(commandName?: string): string {
  const pkg = getPackageJson();
  const command = resolveCommand(commandName);
  if (!command) return `Unknown command: ${commandName}`;

  const lines: string[] = [];
  lines.push(chalk.bold.blue(`${pkg.name} v${pkg.version}`));
  lines.push("");
  const usageBase = chalk.bold("Usage:");
  if (command === rootCommand) {
    lines.push(`${usageBase} ${chalk.cyan("ts-fix-baseurl")} ${chalk.yellow("[options]")} ${chalk.green("<path>")}`);
  } else {
    lines.push(
      `${usageBase} ${chalk.cyan("ts-fix-baseurl")} ${chalk.magenta(command.name)} ${chalk.yellow("[options]")}`,
    );
  }
  lines.push("");
  lines.push(command.description);
  lines.push("");
  lines.push(chalk.bold("Arguments:"));
  lines.push(`  ${chalk.green("path")}        Path to tsconfig.json file or directory containing tsconfig.json`);
  lines.push("");
  lines.push(chalk.bold("Options:"));
  lines.push(...formatOptions(command.options));
  const subcommands = commands.filter(c => c !== rootCommand && c.name);
  if (command === rootCommand && subcommands.length) {
    lines.push("");
    lines.push(chalk.bold("Commands:"));
    const pad = Math.max(...subcommands.map(c => c.name.length)) + 2;
    for (const c of subcommands) {
      lines.push("  " + chalk.magenta(c.name.padEnd(pad)) + c.description);
    }
  }
  lines.push("");
  lines.push(chalk.dim("Examples:"));
  lines.push(chalk.dim("  ts-fix-baseurl .                    # Fix current directory"));
  lines.push(chalk.dim("  ts-fix-baseurl ./tsconfig.json     # Fix specific tsconfig"));
  lines.push(chalk.dim("  ts-fix-baseurl my-project/          # Fix project directory"));
  lines.push("");
  return lines.join("\n");
}

function printHelpAndReturn(code: number) {
  process.stdout.write(renderHelp() + "\n");
  return code;
}

export async function cli(argv: string[]): Promise<number> {
  const commandName = undefined; // placeholder for future subcommand parsing
  const command = resolveCommand(commandName)!;
  const { values, positionals } = parseArgs({ ...buildParseConfig(command), args: argv.slice(2) });

  if (values.help) return printHelpAndReturn(0);
  if (values.version) {
    process.stdout.write(getPackageJson().version + "\n");
    return 0;
  }

  const ctx: RunContext = { values, positionals, pkg: getPackageJson() };
  const result = await command.run(ctx);
  return result;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const code = await cli(process.argv);
  process.exit(code);
}
