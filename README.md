# @lxgicstudios/composegen

[![npm version](https://img.shields.io/npm/v/@lxgicstudios/composegen)](https://www.npmjs.com/package/@lxgicstudios/composegen)
[![license](https://img.shields.io/npm/l/@lxgicstudios/composegen)](LICENSE)
[![node](https://img.shields.io/node/v/@lxgicstudios/composegen)](package.json)

Generate docker-compose.yml files from interactive prompts or predefined stack templates. Stop writing YAML by hand.

Zero external dependencies. Just Node.js builtins.

## Install

```bash
npm install -g @lxgicstudios/composegen
```

Or run directly:

```bash
npx @lxgicstudios/composegen --stack mean
```

## Usage

```bash
# Interactive mode - pick services step by step
composegen

# Generate a MEAN stack instantly
composegen --stack mean

# Add Redis to your existing docker-compose.yml
composegen --add redis

# Validate an existing compose file
composegen --validate docker-compose.yml

# List all available stacks and services
composegen --list
```

## Features

- **Interactive builder** with step-by-step prompts
- **Predefined stacks**: MEAN, LAMP, Next+Postgres, Rails+Redis
- **Add services** to existing compose files
- **Validate** compose file structure
- **8 individual services**: Postgres, MySQL, Redis, MongoDB, Nginx, RabbitMQ, Elasticsearch, MinIO
- **JSON output** for automation
- **Zero dependencies** - uses only Node.js builtins

## Stacks

| Stack | Services |
|-------|----------|
| `mean` | MongoDB + Express + Angular + Node.js |
| `lamp` | Apache + MySQL + PHP + phpMyAdmin |
| `next-postgres` | Next.js + PostgreSQL |
| `rails-redis` | Rails + Redis + PostgreSQL + Sidekiq |

## Available Services

`postgres` `mysql` `redis` `mongo` `nginx` `rabbitmq` `elasticsearch` `minio`

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `--stack <name>` | Generate from template | |
| `--add <service>` | Add service to existing file | |
| `--validate <file>` | Validate compose file | |
| `--list` | List stacks and services | |
| `--output <file>` | Output file path | `docker-compose.yml` |
| `--json` | Output as JSON | `false` |
| `--help` | Show help message | |
| `--version` | Show version number | |

## License

MIT - [LXGIC Studios](https://lxgicstudios.com)
