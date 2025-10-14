# Scripts Directory

This directory contains build, development, and deployment scripts for the Chrome Extension Debug MCP project.

## Build Scripts

### `inject-version.ts`
Injects the current version from `package.json` into the source code before building.
```bash
node --experimental-strip-types scripts/inject-version.ts
```

### `post-build.ts`
Post-build processing tasks (runs automatically after `tsc`).

### `package-bun.sh`
Packages the application into standalone executables for multiple platforms using Bun.
```bash
bash scripts/package-bun.sh
```
Generates binaries for:
- Linux (x64, arm64)
- macOS (x64, arm64)  
- Windows (x64)

## Development Scripts

### `generate-docs.ts`
Generates documentation from source code annotations.
```bash
npm run docs:generate
```

### `prepare.ts`
Prepares the project for installation (runs during `npm install`).

### `sync-server-json-version.ts`
Synchronizes version number across `package.json` and `server.json`.

## Configuration Scripts

### `generate-ide-config.js`
Generates IDE configuration files (`.vscode/settings.json`, etc.) based on the project setup.

### `client-config-generator.sh`
Generates client configuration files for MCP connections.
```bash
bash scripts/client-config-generator.sh
```

## Deployment Scripts

### `start-mcp.sh` / `start-mcp.bat`
Starts the MCP server in stdio mode (default).
- `.sh` for Linux/macOS
- `.bat` for Windows

### `start-http-mcp.sh`
Starts the MCP server in HTTP mode (streamable transport).

### `start-remote-mcp.sh`
Starts the MCP server configured for remote connections.

### `setup-caddy-privileges.sh`
Sets up Caddy reverse proxy with appropriate privileges (Linux only).

### `install.sh`
Installation script for system-wide deployment.

## Usage

Most scripts are invoked automatically through npm scripts defined in `package.json`:

```bash
npm run build          # Runs inject-version.ts + tsc + post-build.ts
npm run docs:generate  # Runs generate-docs.ts
npm run prepare        # Runs prepare.ts
```

For packaging:
```bash
bash scripts/package-bun.sh
```

For deployment:
```bash
# Linux/macOS
bash scripts/start-mcp.sh

# Windows
scripts\start-mcp.bat
```

## Platform Support

- **Cross-platform**: TypeScript scripts (`.ts`, `.js`)
- **Linux/macOS**: Shell scripts (`.sh`)
- **Windows**: Batch files (`.bat`)
