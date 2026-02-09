#!/usr/bin/env node

import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";

// ── ANSI Colors ──────────────────────────────────────────────────────────────

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  bgGreen: "\x1b[42m",
  bgBlue: "\x1b[44m",
  bgMagenta: "\x1b[45m",
  bgRed: "\x1b[41m",
};

const isNoColor = !!process.env["NO_COLOR"];
const color = (code: string, text: string) => (isNoColor ? text : `${code}${text}${c.reset}`);

// ── Types ────────────────────────────────────────────────────────────────────

interface ServiceDef {
  image: string;
  ports?: string[];
  environment?: Record<string, string>;
  volumes?: string[];
  depends_on?: string[];
  restart?: string;
  command?: string;
}

interface ComposeFile {
  version: string;
  services: Record<string, ServiceDef>;
  volumes?: Record<string, null | Record<string, unknown>>;
}

// ── Stack Templates ──────────────────────────────────────────────────────────

const STACKS: Record<string, { name: string; description: string; compose: ComposeFile }> = {
  mean: {
    name: "MEAN Stack",
    description: "MongoDB + Express + Angular + Node.js",
    compose: {
      version: "3.8",
      services: {
        mongo: {
          image: "mongo:7",
          ports: ["27017:27017"],
          volumes: ["mongo_data:/data/db"],
          environment: { MONGO_INITDB_ROOT_USERNAME: "admin", MONGO_INITDB_ROOT_PASSWORD: "password" },
          restart: "unless-stopped",
        },
        api: {
          image: "node:20-alpine",
          ports: ["3000:3000"],
          volumes: ["./api:/app"],
          depends_on: ["mongo"],
          environment: { MONGO_URI: "mongodb://admin:password@mongo:27017", NODE_ENV: "development" },
          command: "sh -c 'cd /app && npm install && npm start'",
          restart: "unless-stopped",
        },
        frontend: {
          image: "node:20-alpine",
          ports: ["4200:4200"],
          volumes: ["./frontend:/app"],
          depends_on: ["api"],
          command: "sh -c 'cd /app && npm install && npm start'",
          restart: "unless-stopped",
        },
      },
      volumes: { mongo_data: null },
    },
  },
  lamp: {
    name: "LAMP Stack",
    description: "Linux + Apache + MySQL + PHP",
    compose: {
      version: "3.8",
      services: {
        web: {
          image: "php:8.3-apache",
          ports: ["80:80"],
          volumes: ["./src:/var/www/html"],
          depends_on: ["db"],
          environment: { APACHE_DOCUMENT_ROOT: "/var/www/html" },
          restart: "unless-stopped",
        },
        db: {
          image: "mysql:8.0",
          ports: ["3306:3306"],
          volumes: ["mysql_data:/var/lib/mysql"],
          environment: {
            MYSQL_ROOT_PASSWORD: "rootpassword",
            MYSQL_DATABASE: "app",
            MYSQL_USER: "appuser",
            MYSQL_PASSWORD: "apppassword",
          },
          restart: "unless-stopped",
        },
        phpmyadmin: {
          image: "phpmyadmin:latest",
          ports: ["8080:80"],
          depends_on: ["db"],
          environment: { PMA_HOST: "db", PMA_PORT: "3306" },
          restart: "unless-stopped",
        },
      },
      volumes: { mysql_data: null },
    },
  },
  "next-postgres": {
    name: "Next.js + Postgres",
    description: "Next.js frontend with PostgreSQL database",
    compose: {
      version: "3.8",
      services: {
        db: {
          image: "postgres:16-alpine",
          ports: ["5432:5432"],
          volumes: ["pg_data:/var/lib/postgresql/data"],
          environment: {
            POSTGRES_DB: "app",
            POSTGRES_USER: "postgres",
            POSTGRES_PASSWORD: "postgres",
          },
          restart: "unless-stopped",
        },
        app: {
          image: "node:20-alpine",
          ports: ["3000:3000"],
          volumes: ["./app:/app"],
          depends_on: ["db"],
          environment: {
            DATABASE_URL: "postgresql://postgres:postgres@db:5432/app",
            NODE_ENV: "development",
          },
          command: "sh -c 'cd /app && npm install && npm run dev'",
          restart: "unless-stopped",
        },
      },
      volumes: { pg_data: null },
    },
  },
  "rails-redis": {
    name: "Rails + Redis",
    description: "Ruby on Rails with Redis and PostgreSQL",
    compose: {
      version: "3.8",
      services: {
        db: {
          image: "postgres:16-alpine",
          ports: ["5432:5432"],
          volumes: ["pg_data:/var/lib/postgresql/data"],
          environment: {
            POSTGRES_DB: "rails_app",
            POSTGRES_USER: "postgres",
            POSTGRES_PASSWORD: "postgres",
          },
          restart: "unless-stopped",
        },
        redis: {
          image: "redis:7-alpine",
          ports: ["6379:6379"],
          volumes: ["redis_data:/data"],
          restart: "unless-stopped",
        },
        web: {
          image: "ruby:3.3",
          ports: ["3000:3000"],
          volumes: ["./app:/app"],
          depends_on: ["db", "redis"],
          environment: {
            DATABASE_URL: "postgresql://postgres:postgres@db:5432/rails_app",
            REDIS_URL: "redis://redis:6379/0",
            RAILS_ENV: "development",
          },
          command: "sh -c 'cd /app && bundle install && rails server -b 0.0.0.0'",
          restart: "unless-stopped",
        },
        sidekiq: {
          image: "ruby:3.3",
          volumes: ["./app:/app"],
          depends_on: ["db", "redis"],
          environment: {
            DATABASE_URL: "postgresql://postgres:postgres@db:5432/rails_app",
            REDIS_URL: "redis://redis:6379/0",
            RAILS_ENV: "development",
          },
          command: "sh -c 'cd /app && bundle exec sidekiq'",
          restart: "unless-stopped",
        },
      },
      volumes: { pg_data: null, redis_data: null },
    },
  },
};

// ── Individual services for --add ────────────────────────────────────────────

const SERVICES: Record<string, { service: ServiceDef; volumes?: string[] }> = {
  postgres: {
    service: {
      image: "postgres:16-alpine",
      ports: ["5432:5432"],
      volumes: ["pg_data:/var/lib/postgresql/data"],
      environment: { POSTGRES_DB: "app", POSTGRES_USER: "postgres", POSTGRES_PASSWORD: "postgres" },
      restart: "unless-stopped",
    },
    volumes: ["pg_data"],
  },
  mysql: {
    service: {
      image: "mysql:8.0",
      ports: ["3306:3306"],
      volumes: ["mysql_data:/var/lib/mysql"],
      environment: { MYSQL_ROOT_PASSWORD: "rootpassword", MYSQL_DATABASE: "app" },
      restart: "unless-stopped",
    },
    volumes: ["mysql_data"],
  },
  redis: {
    service: {
      image: "redis:7-alpine",
      ports: ["6379:6379"],
      volumes: ["redis_data:/data"],
      restart: "unless-stopped",
    },
    volumes: ["redis_data"],
  },
  mongo: {
    service: {
      image: "mongo:7",
      ports: ["27017:27017"],
      volumes: ["mongo_data:/data/db"],
      environment: { MONGO_INITDB_ROOT_USERNAME: "admin", MONGO_INITDB_ROOT_PASSWORD: "password" },
      restart: "unless-stopped",
    },
    volumes: ["mongo_data"],
  },
  nginx: {
    service: {
      image: "nginx:alpine",
      ports: ["80:80", "443:443"],
      volumes: ["./nginx.conf:/etc/nginx/nginx.conf:ro"],
      restart: "unless-stopped",
    },
  },
  rabbitmq: {
    service: {
      image: "rabbitmq:3-management-alpine",
      ports: ["5672:5672", "15672:15672"],
      volumes: ["rabbitmq_data:/var/lib/rabbitmq"],
      environment: { RABBITMQ_DEFAULT_USER: "admin", RABBITMQ_DEFAULT_PASS: "password" },
      restart: "unless-stopped",
    },
    volumes: ["rabbitmq_data"],
  },
  elasticsearch: {
    service: {
      image: "elasticsearch:8.12.0",
      ports: ["9200:9200"],
      volumes: ["es_data:/usr/share/elasticsearch/data"],
      environment: { "discovery.type": "single-node", "xpack.security.enabled": "false" },
      restart: "unless-stopped",
    },
    volumes: ["es_data"],
  },
  minio: {
    service: {
      image: "minio/minio:latest",
      ports: ["9000:9000", "9001:9001"],
      volumes: ["minio_data:/data"],
      environment: { MINIO_ROOT_USER: "minioadmin", MINIO_ROOT_PASSWORD: "minioadmin" },
      command: "server /data --console-address ':9001'",
      restart: "unless-stopped",
    },
    volumes: ["minio_data"],
  },
};

// ── YAML Serializer (minimal, no deps) ───────────────────────────────────────

function toYaml(obj: unknown, indent: number = 0): string {
  const pad = "  ".repeat(indent);

  if (obj === null || obj === undefined) {
    return "null";
  }

  if (typeof obj === "string") {
    if (obj.includes(":") || obj.includes("#") || obj.includes("'") || obj.startsWith("{") || obj.startsWith("[")) {
      return `"${obj.replace(/"/g, '\\"')}"`;
    }
    return obj;
  }

  if (typeof obj === "number" || typeof obj === "boolean") {
    return String(obj);
  }

  if (Array.isArray(obj)) {
    if (obj.length === 0) return "[]";
    return obj.map((item) => `${pad}- ${toYaml(item, indent + 1).trimStart()}`).join("\n");
  }

  if (typeof obj === "object") {
    const entries = Object.entries(obj as Record<string, unknown>);
    if (entries.length === 0) return "{}";

    return entries
      .map(([key, val]) => {
        if (val === null) {
          return `${pad}${key}:`;
        }
        if (typeof val === "object" && !Array.isArray(val)) {
          return `${pad}${key}:\n${toYaml(val, indent + 1)}`;
        }
        if (Array.isArray(val)) {
          return `${pad}${key}:\n${toYaml(val, indent + 1)}`;
        }
        return `${pad}${key}: ${toYaml(val, indent)}`;
      })
      .join("\n");
  }

  return String(obj);
}

// ── Readline Helper ──────────────────────────────────────────────────────────

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(color(c.cyan, "  ? ") + color(c.white, question) + " ", (answer) => {
      resolve(answer.trim());
    });
  });
}

function askChoice(rl: readline.Interface, question: string, choices: string[]): Promise<number> {
  return new Promise((resolve) => {
    console.log(color(c.cyan, "\n  ? ") + color(c.white + c.bold, question));
    choices.forEach((choice, i) => {
      console.log(color(c.dim, `    ${i + 1}) `) + color(c.white, choice));
    });
    rl.question(color(c.cyan, "  > "), (answer) => {
      const idx = parseInt(answer.trim(), 10) - 1;
      resolve(idx >= 0 && idx < choices.length ? idx : 0);
    });
  });
}

// ── Interactive Mode ─────────────────────────────────────────────────────────

async function interactiveMode(): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log(color(c.magenta + c.bold, "\n  Interactive Compose Generator\n"));

  const stackNames = Object.keys(STACKS);
  const stackChoices = stackNames.map((k) => `${STACKS[k]!.name} - ${STACKS[k]!.description}`);
  stackChoices.push("Custom - Build from scratch");

  const choice = await askChoice(rl, "Pick a stack template:", stackChoices);

  let compose: ComposeFile;

  if (choice < stackNames.length) {
    const key = stackNames[choice]!;
    compose = JSON.parse(JSON.stringify(STACKS[key]!.compose));
    console.log(color(c.green, `\n  Using ${STACKS[key]!.name} template`));
  } else {
    // Custom build
    compose = { version: "3.8", services: {}, volumes: {} };
    console.log(color(c.green, "\n  Building custom compose file\n"));

    const serviceList = Object.keys(SERVICES);
    let adding = true;

    while (adding) {
      const svcChoice = await askChoice(
        rl,
        "Add a service:",
        [...serviceList.map((s) => s), "Done - finish building"]
      );

      if (svcChoice >= serviceList.length) {
        adding = false;
      } else {
        const svcName = serviceList[svcChoice]!;
        const svcDef = SERVICES[svcName]!;
        compose.services[svcName] = JSON.parse(JSON.stringify(svcDef.service));
        if (svcDef.volumes) {
          if (!compose.volumes) compose.volumes = {};
          for (const vol of svcDef.volumes) {
            compose.volumes[vol] = null;
          }
        }
        console.log(color(c.green, `  + Added ${svcName}`));
      }
    }
  }

  const outputPath = await ask(rl, "Output file (default: docker-compose.yml):");
  const finalPath = outputPath || "docker-compose.yml";

  rl.close();

  const yaml = toYaml(compose);
  fs.writeFileSync(finalPath, yaml + "\n");
  console.log(
    color(c.bgGreen + c.white + c.bold, " CREATED ") +
    color(c.green, ` ${finalPath}`) +
    color(c.dim, ` (${Object.keys(compose.services).length} services)`) +
    "\n"
  );
}

// ── Validate ─────────────────────────────────────────────────────────────────

function validateFile(filePath: string, jsonOutput: boolean): void {
  if (!fs.existsSync(filePath)) {
    if (jsonOutput) {
      console.log(JSON.stringify({ valid: false, error: "File not found", file: filePath }));
    } else {
      console.error(color(c.red + c.bold, "\n  ERROR: ") + `File not found: ${filePath}\n`);
    }
    process.exit(1);
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const issues: string[] = [];

  // Basic YAML-like validation
  if (!content.includes("services")) {
    issues.push("Missing 'services' key");
  }

  // Check for common mistakes
  const lines = content.split("\n");
  let lineNum = 0;
  for (const line of lines) {
    lineNum++;
    if (line.includes("\t")) {
      issues.push(`Line ${lineNum}: Tab character found (use spaces)`);
    }
  }

  // Check for version
  if (!content.includes("version")) {
    issues.push("Missing 'version' key (recommended)");
  }

  if (jsonOutput) {
    console.log(
      JSON.stringify({
        valid: issues.length === 0,
        file: filePath,
        issues,
        lines: lines.length,
      })
    );
  } else {
    if (issues.length === 0) {
      console.log(
        color(c.bgGreen + c.white + c.bold, " VALID ") +
        color(c.green, ` ${filePath} looks good!`) +
        "\n"
      );
    } else {
      console.log(color(c.bgRed + c.white + c.bold, " ISSUES ") + color(c.yellow, ` Found ${issues.length} issue(s):\n`));
      issues.forEach((issue) => {
        console.log(color(c.yellow, `  - ${issue}`));
      });
      console.log();
    }
  }
}

// ── Add Service ──────────────────────────────────────────────────────────────

function addService(serviceName: string, composePath: string, jsonOutput: boolean): void {
  const svcDef = SERVICES[serviceName.toLowerCase()];
  if (!svcDef) {
    const available = Object.keys(SERVICES).join(", ");
    if (jsonOutput) {
      console.log(JSON.stringify({ error: `Unknown service: ${serviceName}`, available: Object.keys(SERVICES) }));
    } else {
      console.error(color(c.red + c.bold, "\n  ERROR: ") + `Unknown service "${serviceName}"`);
      console.error(color(c.dim, `  Available: ${available}\n`));
    }
    process.exit(1);
  }

  // Create a minimal compose with just this service
  const compose: ComposeFile = {
    version: "3.8",
    services: { [serviceName.toLowerCase()]: svcDef.service },
  };

  if (svcDef.volumes && svcDef.volumes.length > 0) {
    compose.volumes = {};
    for (const vol of svcDef.volumes) {
      compose.volumes[vol] = null;
    }
  }

  const yaml = toYaml(compose);

  if (fs.existsSync(composePath)) {
    // Append service definition
    const existing = fs.readFileSync(composePath, "utf-8");
    const serviceYaml = toYaml({ [serviceName.toLowerCase()]: svcDef.service }, 1);
    const volumeYaml = svcDef.volumes ? svcDef.volumes.map((v) => `  ${v}:`).join("\n") : "";

    // Simple append approach: add service and volume sections
    let updated = existing.trimEnd() + "\n" + serviceYaml + "\n";
    if (volumeYaml && !existing.includes("volumes:")) {
      updated += "\nvolumes:\n" + volumeYaml + "\n";
    } else if (volumeYaml && existing.includes("volumes:")) {
      updated += volumeYaml + "\n";
    }

    fs.writeFileSync(composePath, updated);
  } else {
    fs.writeFileSync(composePath, yaml + "\n");
  }

  if (jsonOutput) {
    console.log(JSON.stringify({ added: serviceName, file: composePath, service: svcDef.service }));
  } else {
    console.log(
      color(c.bgGreen + c.white + c.bold, " ADDED ") +
      color(c.green, ` ${serviceName} to ${composePath}`) +
      "\n"
    );
  }
}

// ── Help / Banner ────────────────────────────────────────────────────────────

function printBanner(): void {
  console.log(
    color(c.magenta + c.bold, `
   ____                                  ____            
  / ___|___  _ __ ___  _ __   ___  ___  / ___| ___ _ __  
 | |   / _ \\| '_ \` _ \\| '_ \\ / _ \\/ __|| |  _ / _ \\ '_ \\ 
 | |__| (_) | | | | | | |_) | (_) \\__ \\| |_| |  __/ | | |
  \\____\\___/|_| |_| |_| .__/ \\___/|___/ \\____|\\___||_| |_|
                       |_|                                 
`)
  );
  console.log(color(c.dim, "  Generate docker-compose.yml from templates\n"));
}

function printHelp(): void {
  printBanner();
  console.log(`${color(c.yellow + c.bold, "USAGE:")}
  ${color(c.white, "composegen")} ${color(c.dim, "[options]")}

${color(c.yellow + c.bold, "COMMANDS:")}
  ${color(c.green, "(no args)")}                     Interactive mode - build step by step
  ${color(c.green, "--stack <name>")}                Generate from template
  ${color(c.green, "--add <service>")}               Add a service to existing compose
  ${color(c.green, "--validate <file>")}             Validate an existing compose file
  ${color(c.green, "--list")}                        List available stacks and services

${color(c.yellow + c.bold, "OPTIONS:")}
  ${color(c.green, "--output <file>")}               Output file (default: docker-compose.yml)
  ${color(c.green, "--json")}                        Output as JSON
  ${color(c.green, "--help")}                        Show this help message
  ${color(c.green, "--version")}                     Show version number

${color(c.yellow + c.bold, "STACKS:")}
  ${color(c.cyan, "mean")}          MongoDB + Express + Angular + Node.js
  ${color(c.cyan, "lamp")}          Linux + Apache + MySQL + PHP
  ${color(c.cyan, "next-postgres")} Next.js + PostgreSQL
  ${color(c.cyan, "rails-redis")}   Rails + Redis + PostgreSQL

${color(c.yellow + c.bold, "SERVICES:")}
  ${color(c.cyan, "postgres")}  ${color(c.cyan, "mysql")}  ${color(c.cyan, "redis")}  ${color(c.cyan, "mongo")}  ${color(c.cyan, "nginx")}
  ${color(c.cyan, "rabbitmq")}  ${color(c.cyan, "elasticsearch")}  ${color(c.cyan, "minio")}

${color(c.yellow + c.bold, "EXAMPLES:")}
  ${color(c.dim, "# Interactive mode")}
  ${color(c.white, "composegen")}

  ${color(c.dim, "# Generate MEAN stack")}
  ${color(c.white, "composegen --stack mean")}

  ${color(c.dim, "# Add Redis to existing file")}
  ${color(c.white, "composegen --add redis")}

  ${color(c.dim, "# Validate compose file")}
  ${color(c.white, "composegen --validate docker-compose.yml")}
`);
}

// ── Parse Args ───────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): {
  stack: string | null;
  add: string | null;
  validate: string | null;
  output: string;
  list: boolean;
  json: boolean;
  help: boolean;
  version: boolean;
} {
  const result = {
    stack: null as string | null,
    add: null as string | null,
    validate: null as string | null,
    output: "docker-compose.yml",
    list: false,
    json: false,
    help: false,
    version: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--help" || arg === "-h") result.help = true;
    else if (arg === "--version" || arg === "-v") result.version = true;
    else if (arg === "--json") result.json = true;
    else if (arg === "--list" || arg === "-l") result.list = true;
    else if (arg === "--stack" && argv[i + 1]) result.stack = argv[++i]!;
    else if (arg === "--add" && argv[i + 1]) result.add = argv[++i]!;
    else if (arg === "--validate" && argv[i + 1]) result.validate = argv[++i]!;
    else if ((arg === "--output" || arg === "-o") && argv[i + 1]) result.output = argv[++i]!;
  }

  return result;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.version) {
    console.log("1.0.0");
    process.exit(0);
  }

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (args.list) {
    if (args.json) {
      console.log(
        JSON.stringify({
          stacks: Object.entries(STACKS).map(([k, v]) => ({ id: k, name: v.name, description: v.description })),
          services: Object.keys(SERVICES),
        })
      );
    } else {
      printBanner();
      console.log(color(c.yellow + c.bold, "  Available Stacks:\n"));
      for (const [key, val] of Object.entries(STACKS)) {
        console.log(color(c.cyan + c.bold, `    ${key.padEnd(16)}`), color(c.white, val.description));
      }
      console.log(color(c.yellow + c.bold, "\n  Available Services:\n"));
      console.log(color(c.cyan, `    ${Object.keys(SERVICES).join("  ")}`));
      console.log();
    }
    process.exit(0);
  }

  if (args.validate) {
    validateFile(args.validate, args.json);
    process.exit(0);
  }

  if (args.add) {
    addService(args.add, args.output, args.json);
    process.exit(0);
  }

  if (args.stack) {
    const stack = STACKS[args.stack];
    if (!stack) {
      const available = Object.keys(STACKS).join(", ");
      console.error(color(c.red + c.bold, "\n  ERROR: ") + `Unknown stack "${args.stack}"`);
      console.error(color(c.dim, `  Available: ${available}\n`));
      process.exit(1);
    }

    const yaml = toYaml(stack.compose);
    fs.writeFileSync(args.output, yaml + "\n");

    if (args.json) {
      console.log(
        JSON.stringify({
          stack: args.stack,
          file: args.output,
          services: Object.keys(stack.compose.services),
        })
      );
    } else {
      printBanner();
      console.log(
        color(c.bgGreen + c.white + c.bold, " CREATED ") +
        color(c.green, ` ${args.output}`) +
        color(c.dim, ` (${stack.name} - ${Object.keys(stack.compose.services).length} services)`) +
        "\n"
      );
    }
    process.exit(0);
  }

  // Default: interactive mode
  if (!process.stdin.isTTY) {
    printHelp();
    process.exit(1);
  }

  printBanner();
  await interactiveMode();
}

main().catch((err) => {
  console.error(color(c.red, `Error: ${err instanceof Error ? err.message : String(err)}`));
  process.exit(1);
});
