# Chrome Extension Debug MCP

[![npm chrome-extension-debug-mcp package](https://img.shields.io/npm/v/chrome-extension-debug-mcp.svg)](https://npmjs.org/package/chrome-extension-debug-mcp)

`chrome-extension-debug-mcp` lets your coding agent (such as Gemini, Claude, Cursor or Copilot)
control and inspect a live Chrome browser. It acts as a Model-Context-Protocol
(MCP) server, giving your AI coding assistant access to the full power of
Chrome DevTools for reliable automation, in-depth debugging, performance analysis, and **Chrome Extension debugging**.

## [Tool reference](./docs/tool-reference.md) | [Changelog](./CHANGELOG.md) | [Contributing](./CONTRIBUTING.md) | [Troubleshooting](./docs/troubleshooting.md)

## Key features

- **Chrome Extension Debugging**: Debug Chrome extensions with MV2/MV3 support, inspect storage, manage Service Workers, and evaluate code in extension contexts.
- **Get performance insights**: Uses [Chrome
  DevTools](https://github.com/ChromeDevTools/devtools-frontend) to record
  traces and extract actionable performance insights.
- **Advanced browser debugging**: Analyze network requests, take screenshots and
  check the browser console.
- **Reliable automation**: Uses
  [puppeteer](https://github.com/puppeteer/puppeteer) to automate actions in
  Chrome and automatically wait for action results.
- **Multiple transport modes**: Support for stdio (default), SSE, and Streamable HTTP transports.

## Disclaimers

`chrome-devtools-mcp` exposes content of the browser instance to the MCP clients
allowing them to inspect, debug, and modify any data in the browser or DevTools.
Avoid sharing sensitive or personal information that you don't want to share with
MCP clients.

## Requirements

- [Node.js](https://nodejs.org/) v20.19 or a newer [latest maintenance LTS](https://github.com/nodejs/Release#release-schedule) version.
- [Chrome](https://www.google.com/chrome/) current stable version or newer.
- [npm](https://www.npmjs.com/).

## Getting started

Add the following config to your MCP client:

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@latest"]
    }
  }
}
```

> [!NOTE]  
> Using `chrome-devtools-mcp@latest` ensures that your MCP client will always use the latest version of the Chrome DevTools MCP server.

### MCP Client configuration

<details>
  <summary>Claude Code</summary>
    Use the Claude Code CLI to add the Chrome DevTools MCP server (<a href="https://docs.anthropic.com/en/docs/claude-code/mcp">guide</a>):

```bash
claude mcp add chrome-devtools npx chrome-devtools-mcp@latest
```

</details>

<details>
  <summary>Cline</summary>
  Follow https://docs.cline.bot/mcp/configuring-mcp-servers and use the config provided above.
</details>

<details>
  <summary>Codex</summary>
  Follow the <a href="https://github.com/openai/codex/blob/main/docs/advanced.md#model-context-protocol-mcp">configure MCP guide</a>
  using the standard config from above. You can also install the Chrome DevTools MCP server using the Codex CLI:

```bash
codex mcp add chrome-devtools -- npx chrome-devtools-mcp@latest
```

**On Windows 11**

Configure the Chrome install location and increase the startup timeout by updating `.codex/config.toml` and adding the following `env` and `startup_timeout_ms` parameters:

```
[mcp_servers.chrome-devtools]
command = "cmd"
args = [
    "/c",
    "npx",
    "-y",
    "chrome-devtools-mcp@latest",
]
env = { SystemRoot="C:\\Windows", PROGRAMFILES="C:\\Program Files" }
startup_timeout_ms = 20_000
```

</details>

<details>
  <summary>Copilot CLI</summary>

Start Copilot CLI:

```
copilot
```

Start the dialog to add a new MCP server by running:

```
/mcp add
```

Configure the following fields and press `CTRL+S` to save the configuration:

- **Server name:** `chrome-devtools`
- **Server Type:** `[1] Local`
- **Command:** `npx`
- **Arguments:** `-y, chrome-devtools-mcp@latest`

</details>

<details>
  <summary>Copilot / VS Code</summary>
  Follow the MCP install <a href="https://code.visualstudio.com/docs/copilot/chat/mcp-servers#_add-an-mcp-server">guide</a>,
  with the standard config from above. You can also install the Chrome DevTools MCP server using the VS Code CLI:
  
  ```bash
  code --add-mcp '{"name":"chrome-devtools","command":"npx","args":["chrome-devtools-mcp@latest"]}'
  ```
</details>

<details>
  <summary>Cursor</summary>

**Click the button to install:**

[<img src="https://cursor.com/deeplink/mcp-install-dark.svg" alt="Install in Cursor">](https://cursor.com/en/install-mcp?name=chrome-devtools&config=eyJjb21tYW5kIjoibnB4IC15IGNocm9tZS1kZXZ0b29scy1tY3BAbGF0ZXN0In0%3D)

**Or install manually:**

Go to `Cursor Settings` -> `MCP` -> `New MCP Server`. Use the config provided above.

</details>

<details>
  <summary>Gemini CLI</summary>
Install the Chrome DevTools MCP server using the Gemini CLI.

**Project wide:**

```bash
gemini mcp add chrome-devtools npx chrome-devtools-mcp@latest
```

**Globally:**

```bash
gemini mcp add -s user chrome-devtools npx chrome-devtools-mcp@latest
```

Alternatively, follow the <a href="https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md#how-to-set-up-your-mcp-server">MCP guide</a> and use the standard config from above.

</details>

<details>
  <summary>Gemini Code Assist</summary>
  Follow the <a href="https://cloud.google.com/gemini/docs/codeassist/use-agentic-chat-pair-programmer#configure-mcp-servers">configure MCP guide</a>
  using the standard config from above.
</details>

<details>
  <summary>JetBrains AI Assistant & Junie</summary>

Go to `Settings | Tools | AI Assistant | Model Context Protocol (MCP)` -> `Add`. Use the config provided above.
The same way chrome-devtools-mcp can be configured for JetBrains Junie in `Settings | Tools | Junie | MCP Settings` -> `Add`. Use the config provided above.

</details>

<details>
  <summary>Visual Studio</summary>
  
  **Click the button to install:**
  
  [<img src="https://img.shields.io/badge/Visual_Studio-Install-C16FDE?logo=visualstudio&logoColor=white" alt="Install in Visual Studio">](https://vs-open.link/mcp-install?%7B%22name%22%3A%22chrome-devtools%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22chrome-devtools-mcp%40latest%22%5D%7D)
</details>

<details>
  <summary>Warp</summary>

Go to `Settings | AI | Manage MCP Servers` -> `+ Add` to [add an MCP Server](https://docs.warp.dev/knowledge-and-collaboration/mcp#adding-an-mcp-server). Use the config provided above.

</details>

### Your first prompt

Enter the following prompt in your MCP Client to check if everything is working:

```
Check the performance of https://developers.chrome.com
```

Your MCP client should open the browser and record a performance trace.

> [!NOTE]  
> The MCP server will start the browser automatically once the MCP client uses a tool that requires a running browser instance. Connecting to the Chrome DevTools MCP server on its own will not automatically start the browser.

## Tools

If you run into any issues, checkout our [troubleshooting guide](./docs/troubleshooting.md).

<!-- BEGIN AUTO GENERATED TOOLS -->

- **Input automation** (7 tools)
  - [`click`](docs/tool-reference.md#click)
  - [`drag`](docs/tool-reference.md#drag)
  - [`fill`](docs/tool-reference.md#fill)
  - [`fill_form`](docs/tool-reference.md#fill_form)
  - [`handle_dialog`](docs/tool-reference.md#handle_dialog)
  - [`hover`](docs/tool-reference.md#hover)
  - [`upload_file`](docs/tool-reference.md#upload_file)
- **Navigation automation** (7 tools)
  - [`close_page`](docs/tool-reference.md#close_page)
  - [`list_pages`](docs/tool-reference.md#list_pages)
  - [`navigate_page`](docs/tool-reference.md#navigate_page)
  - [`navigate_page_history`](docs/tool-reference.md#navigate_page_history)
  - [`new_page`](docs/tool-reference.md#new_page)
  - [`select_page`](docs/tool-reference.md#select_page)
  - [`wait_for`](docs/tool-reference.md#wait_for)
- **Emulation** (3 tools)
  - [`emulate_cpu`](docs/tool-reference.md#emulate_cpu)
  - [`emulate_network`](docs/tool-reference.md#emulate_network)
  - [`resize_page`](docs/tool-reference.md#resize_page)
- **Performance** (3 tools)
  - [`performance_analyze_insight`](docs/tool-reference.md#performance_analyze_insight)
  - [`performance_start_trace`](docs/tool-reference.md#performance_start_trace)
  - [`performance_stop_trace`](docs/tool-reference.md#performance_stop_trace)
- **Network** (2 tools)
  - [`get_network_request`](docs/tool-reference.md#get_network_request)
  - [`list_network_requests`](docs/tool-reference.md#list_network_requests)
- **Debugging** (4 tools)
  - [`evaluate_script`](docs/tool-reference.md#evaluate_script)
  - [`list_console_messages`](docs/tool-reference.md#list_console_messages)
  - [`take_screenshot`](docs/tool-reference.md#take_screenshot)
  - [`take_snapshot`](docs/tool-reference.md#take_snapshot)
- **Extension debugging** (11 tools)
  - [`evaluate_in_extension`](docs/tool-reference.md#evaluate_in_extension)
  - [`get_extension_details`](docs/tool-reference.md#get_extension_details)
  - [`get_extension_logs`](docs/tool-reference.md#get_extension_logs)
  - [`inspect_extension_storage`](docs/tool-reference.md#inspect_extension_storage)
  - [`list_extension_contexts`](docs/tool-reference.md#list_extension_contexts)
  - [`list_extensions`](docs/tool-reference.md#list_extensions)
  - [`monitor_extension_messages`](docs/tool-reference.md#monitor_extension_messages)
  - [`reload_extension`](docs/tool-reference.md#reload_extension)
  - [`switch_extension_context`](docs/tool-reference.md#switch_extension_context)
  - [`trace_extension_api_calls`](docs/tool-reference.md#trace_extension_api_calls)
  - [`watch_extension_storage`](docs/tool-reference.md#watch_extension_storage)

<!-- END AUTO GENERATED TOOLS -->

## Configuration

The Chrome DevTools MCP server supports the following configuration option:

<!-- BEGIN AUTO GENERATED OPTIONS -->

- **`--browserUrl`, `-u`**
  Connect to a running Chrome instance using port forwarding. For more details see: https://developer.chrome.com/docs/devtools/remote-debugging/local-server.
  - **Type:** string

- **`--headless`**
  Whether to run in headless (no UI) mode.
  - **Type:** boolean
  - **Default:** `false`

- **`--executablePath`, `-e`**
  Path to custom Chrome executable.
  - **Type:** string

- **`--isolated`**
  If specified, creates a temporary user-data-dir that is automatically cleaned up after the browser is closed.
  - **Type:** boolean
  - **Default:** `false`

- **`--channel`**
  Specify a different Chrome channel that should be used. The default is the stable channel version.
  - **Type:** string
  - **Choices:** `stable`, `canary`, `beta`, `dev`

- **`--logFile`**
  Path to a file to write debug logs to. Set the env variable `DEBUG` to `*` to enable verbose logs. Useful for submitting bug reports.
  - **Type:** string

- **`--viewport`**
  Initial viewport size for the Chrome instances started by the server. For example, `1280x720`. In headless mode, max size is 3840x2160px.
  - **Type:** string

- **`--proxyServer`**
  Proxy server configuration for Chrome passed as --proxy-server when launching the browser. See https://www.chromium.org/developers/design-documents/network-settings/ for details.
  - **Type:** string

- **`--acceptInsecureCerts`**
  If enabled, ignores errors relative to self-signed and expired certificates. Use with caution.
  - **Type:** boolean

- **`--chromeArg`**
  Additional arguments for Chrome. Only applies when Chrome is launched by chrome-extension-debug-mcp.
  - **Type:** array

- **`--transport`, `-t`**
  Transport protocol to use for MCP communication.
  - **Type:** string
  - **Choices:** `stdio`, `sse`, `streamable`
  - **Default:** `stdio`

- **`--port`, `-p`**
  Port number for HTTP-based transports (SSE or Streamable).
  - **Type:** number

<!-- END AUTO GENERATED OPTIONS -->

Pass them via the `args` property in the JSON configuration. For example:

```json
{
  "mcpServers": {
    "chrome-extension-debug": {
      "command": "npx",
      "args": [
        "chrome-extension-debug-mcp@latest",
        "--channel=canary",
        "--headless=true",
        "--isolated=true"
      ]
    }
  }
}
```

You can also run `npx chrome-extension-debug-mcp@latest --help` to see all available configuration options.

## Transport Modes

`chrome-extension-debug-mcp` supports three transport protocols for MCP communication:

### stdio (Default)

Standard input/output transport - the default mode used by most MCP clients.

```json
{
  "mcpServers": {
    "chrome-extension-debug": {
      "command": "npx",
      "args": ["chrome-extension-debug-mcp@latest"]
    }
  }
}
```

### SSE (Server-Sent Events)

HTTP streaming transport using Server-Sent Events. Useful for web-based MCP clients or remote server deployments.

**Start the SSE server:**

```bash
# Using npx
npx chrome-extension-debug-mcp@latest --transport sse

# Using standalone binary
./chrome-extension-debug-mcp --transport sse

# Using Node.js directly (after npm install)
node build/src/server-sse.js

# Custom port (default: 32122)
npx chrome-extension-debug-mcp@latest --transport sse --port 3000

# With browser options
npx chrome-extension-debug-mcp@latest --transport sse --browserUrl http://localhost:9222 --headless
```

> **Note**: SSE server listens on port **32122** by default. Use `--port` to customize.

**Test the server:**

Open in browser: `http://localhost:32122/test`

**Available endpoints:**
- **Health check**: `http://localhost:32122/health`
- **SSE endpoint**: `http://localhost:32122/sse` (MCP client connects here)
- **Message endpoint**: `http://localhost:32122/message` (for posting MCP messages)
- **Test page**: `http://localhost:32122/test` (browser-based testing interface)

**Configure MCP client to connect:**

For SSE transport, you need an HTTP-based MCP client. Example configuration:

```json
{
  "mcpServers": {
    "chrome-extension-debug": {
      "transport": {
        "type": "sse",
        "url": "http://localhost:32122/sse"
      }
    }
  }
}
```

**For remote server access:**

If running on a remote server (e.g., `192.168.1.100`):

```json
{
  "mcpServers": {
    "chrome-extension-debug": {
      "transport": {
        "type": "sse",
        "url": "http://192.168.1.100:32122/sse"
      }
    }
  }
}
```

### Streamable HTTP

Latest MCP standard using Streamable HTTP transport. This is the recommended HTTP-based transport for production use.

**Start the Streamable HTTP server:**

```bash
# Using npx
npx chrome-extension-debug-mcp@latest --transport streamable

# Using standalone binary
./chrome-extension-debug-mcp --transport streamable

# Using Node.js directly (after npm install)
node build/src/server-http.js

# Custom port (default: 32123)
npx chrome-extension-debug-mcp@latest --transport streamable --port 3000

# With browser options
npx chrome-extension-debug-mcp@latest --transport streamable --headless --isolated
```

> **Note**: Streamable HTTP server listens on port **32123** by default. Use `--port` to customize.

**Test the server:**

Open in browser: `http://localhost:32123/test`

**Available endpoints:**
- **Health check**: `http://localhost:32123/health`
- **MCP endpoint**: `http://localhost:32123/mcp` (MCP client connects here)
- **Test page**: `http://localhost:32123/test` (browser-based testing interface)

**Configure MCP client to connect:**

Streamable HTTP transport uses the MCP Streamable HTTP protocol. Configure your MCP client with:

```json
{
  "mcpServers": {
    "chrome-extension-debug": {
      "transport": {
        "type": "streamable-http",
        "url": "http://localhost:32123/mcp"
      }
    }
  }
}
```

**For remote server access:**

If running on a remote server (e.g., `192.168.1.100`):

```json
{
  "mcpServers": {
    "chrome-extension-debug": {
      "transport": {
        "type": "streamable-http",
        "url": "http://192.168.1.100:32123/mcp"
      }
    }
  }
}
```

**With reverse proxy (recommended for production):**

```json
{
  "mcpServers": {
    "chrome-extension-debug": {
      "transport": {
        "type": "streamable-http",
        "url": "https://your-domain.com/mcp"
      }
    }
  }
}
```

### Combining with Browser Options

All browser configuration options work with any transport mode:

```bash
# SSE with remote browser
npx chrome-extension-debug-mcp@latest --transport sse --browserUrl http://localhost:9222

# Streamable with headless Chrome
npx chrome-extension-debug-mcp@latest --transport streamable --headless

# With specific Chrome channel
npx chrome-extension-debug-mcp@latest --transport streamable --channel canary

# Custom port with multiple options
npx chrome-extension-debug-mcp@latest --transport sse --port 3000 --headless --isolated

# Standalone binary usage
./chrome-extension-debug-mcp --transport streamable --port 8080 --channel beta
```

### Deployment Considerations

**Network Access:**
- By default, the HTTP server listens on all network interfaces (`0.0.0.0`)
- Ensure firewall rules allow access to the configured port
- Use reverse proxy (Caddy, nginx) for HTTPS in production

**Security:**
- HTTP transports expose browser control over the network
- Use HTTPS with authentication in production environments
- Consider using SSH tunneling for remote access: `ssh -L 3000:localhost:3000 user@remote-server`

**Example: SSH Tunnel for Remote Access**

On your local machine:
```bash
# Create SSH tunnel for Streamable HTTP (default port 32123)
ssh -L 32123:localhost:32123 user@remote-server

# Or for SSE (default port 32122)
ssh -L 32122:localhost:32122 user@remote-server
```

On the remote server:
```bash
# Start Streamable HTTP server
npx chrome-extension-debug-mcp@latest --transport streamable

# Or start SSE server
npx chrome-extension-debug-mcp@latest --transport sse

# Using standalone binary
./chrome-extension-debug-mcp --transport streamable
```

Then configure your local MCP client to connect to `http://localhost:32123/mcp` (Streamable) or `http://localhost:32122/sse` (SSE).

## Chrome Extension Debugging

`chrome-extension-debug-mcp` provides comprehensive tools for debugging Chrome extensions:

### Supported Features

- ✅ **Manifest V2 & V3** - Full support for both extension manifest versions
- ✅ **Service Worker Management** - Detect, activate, and monitor MV3 Service Workers
- ✅ **Storage Inspection** - Read/write extension storage (local, sync, session, managed)
- ✅ **Context Switching** - Debug different extension contexts (background, popup, options, content scripts)
- ✅ **Code Evaluation** - Execute JavaScript in extension contexts
- ✅ **Console Logs** - Capture and analyze extension console output
- ✅ **Hot Reload** - Reload extensions to apply code changes

### Quick Start

1. **List installed extensions:**
   ```
   Use list_extensions to see all installed extensions
   ```

2. **Get extension details:**
   ```
   Use get_extension_details with the extension ID
   ```

3. **Inspect extension storage:**
   ```
   Use inspect_extension_storage to view local/sync/session storage
   ```

4. **Execute code in extension:**
   ```
   Use evaluate_in_extension to run JavaScript in the extension context
   ```

### MV3 Service Worker Notes

Chrome MV3 extensions use Service Workers which can be in "inactive" state. If you need to interact with an inactive Service Worker:

1. Open `chrome://extensions/` in a new tab
2. Find your target extension
3. Click the blue "**Service worker**" link
4. Keep the DevTools window open while debugging

This ensures `chrome.*` APIs are available for extension tools.

### Example Prompts

- "List all installed Chrome extensions"
- "Show me the storage data for extension ID xxxxx"
- "Reload the extension and check for errors"
- "Get console logs from the extension Service Worker"
- "Execute chrome.storage.local.get() in the extension"

## Concepts

### User data directory

`chrome-extension-debug-mcp` starts a Chrome's stable channel instance using the following user
data directory:

- Linux / macOS: `$HOME/.cache/chrome-extension-debug-mcp/chrome-profile-$CHANNEL`
- Windows: `%HOMEPATH%/.cache/chrome-extension-debug-mcp/chrome-profile-$CHANNEL`

The user data directory is not cleared between runs and shared across
all instances of `chrome-extension-debug-mcp`. Set the `isolated` option to `true`
to use a temporary user data dir instead which will be cleared automatically after
the browser is closed.

### Connecting to a running Chrome instance

You can connect to a running Chrome instance by using the `--browser-url` option. This is useful if you want to use your existing Chrome profile or if you are running the MCP server in a sandboxed environment that does not allow starting a new Chrome instance.

Here is a step-by-step guide on how to connect to a running Chrome Stable instance:

**Step 1: Configure the MCP client**

Add the `--browser-url` option to your MCP client configuration. The value of this option should be the URL of the running Chrome instance. `http://localhost:9222` is a common default.

```json
{
  "mcpServers": {
    "chrome-extension-debug": {
      "command": "npx",
      "args": [
        "chrome-extension-debug-mcp@latest",
        "--browser-url=http://localhost:9222"
      ]
    }
  }
}
```

**Step 2: Start the Chrome browser**

> [!WARNING]  
> Enabling the remote debugging port opens up a debugging port on the running browser instance. Any application on your machine can connect to this port and control the browser. Make sure that you are not browsing any sensitive websites while the debugging port is open.

Start the Chrome browser with the remote debugging port enabled. Make sure to close any running Chrome instances before starting a new one with the debugging port enabled. The port number you choose must be the same as the one you specified in the `--browser-url` option in your MCP client configuration.

For security reasons, [Chrome requires you to use a non-default user data directory](https://developer.chrome.com/blog/remote-debugging-port) when enabling the remote debugging port. You can specify a custom directory using the `--user-data-dir` flag. This ensures that your regular browsing profile and data are not exposed to the debugging session.

**macOS**

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-profile-stable
```

**Linux**

```bash
/usr/bin/google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-profile-stable
```

**Windows**

```bash
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%TEMP%\chrome-profile-stable"
```

**Step 3: Test your setup**

After configuring the MCP client and starting the Chrome browser, you can test your setup by running a simple prompt in your MCP client:

```
Check the performance of https://developers.chrome.com
```

Your MCP client should connect to the running Chrome instance and receive a performance report.

For more details on remote debugging, see the [Chrome DevTools documentation](https://developer.chrome.com/docs/devtools/remote-debugging/).

## Known limitations

### Operating system sandboxes

Some MCP clients allow sandboxing the MCP server using macOS Seatbelt or Linux
containers. If sandboxes are enabled, `chrome-extension-debug-mcp` is not able to start
Chrome that requires permissions to create its own sandboxes. As a workaround,
either disable sandboxing for `chrome-extension-debug-mcp` in your MCP client or use
`--browser-url` to connect to a Chrome instance that you start manually outside
of the MCP client sandbox.
