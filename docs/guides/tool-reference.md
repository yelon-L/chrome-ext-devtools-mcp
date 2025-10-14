<!-- AUTO GENERATED DO NOT EDIT - run 'npm run docs' to update-->

# Chrome DevTools MCP Tool Reference

- **[Input automation](#input-automation)** (7 tools)
  - [`click`](#click)
  - [`drag`](#drag)
  - [`fill`](#fill)
  - [`fill_form`](#fill_form)
  - [`handle_dialog`](#handle_dialog)
  - [`hover`](#hover)
  - [`upload_file`](#upload_file)
- **[Navigation automation](#navigation-automation)** (7 tools)
  - [`close_page`](#close_page)
  - [`list_pages`](#list_pages)
  - [`navigate_page`](#navigate_page)
  - [`navigate_page_history`](#navigate_page_history)
  - [`new_page`](#new_page)
  - [`select_page`](#select_page)
  - [`wait_for`](#wait_for)
- **[Emulation](#emulation)** (3 tools)
  - [`emulate_cpu`](#emulate_cpu)
  - [`emulate_network`](#emulate_network)
  - [`resize_page`](#resize_page)
- **[Performance](#performance)** (3 tools)
  - [`performance_analyze_insight`](#performance_analyze_insight)
  - [`performance_start_trace`](#performance_start_trace)
  - [`performance_stop_trace`](#performance_stop_trace)
- **[Network](#network)** (2 tools)
  - [`get_network_request`](#get_network_request)
  - [`list_network_requests`](#list_network_requests)
- **[Debugging](#debugging)** (4 tools)
  - [`evaluate_script`](#evaluate_script)
  - [`list_console_messages`](#list_console_messages)
  - [`take_screenshot`](#take_screenshot)
  - [`take_snapshot`](#take_snapshot)
- **[Extension debugging](#extension-debugging)** (11 tools)
  - [`evaluate_in_extension`](#evaluate_in_extension)
  - [`get_extension_details`](#get_extension_details)
  - [`get_extension_logs`](#get_extension_logs)
  - [`inspect_extension_storage`](#inspect_extension_storage)
  - [`list_extension_contexts`](#list_extension_contexts)
  - [`list_extensions`](#list_extensions)
  - [`monitor_extension_messages`](#monitor_extension_messages)
  - [`reload_extension`](#reload_extension)
  - [`switch_extension_context`](#switch_extension_context)
  - [`trace_extension_api_calls`](#trace_extension_api_calls)
  - [`watch_extension_storage`](#watch_extension_storage)

## Input automation

### `click`

**Description:** Clicks on the provided element

**Parameters:**

- **dblClick** (boolean) _(optional)_: Set to true for double clicks. Default is false.
- **uid** (string) **(required)**: The uid of an element on the page from the page content snapshot

---

### `drag`

**Description:** [`Drag`](#drag) an element onto another element

**Parameters:**

- **from_uid** (string) **(required)**: The uid of the element to [`drag`](#drag)
- **to_uid** (string) **(required)**: The uid of the element to drop into

---

### `fill`

**Description:** Type text into a input, text area or select an option from a &lt;select&gt; element.

**Parameters:**

- **uid** (string) **(required)**: The uid of an element on the page from the page content snapshot
- **value** (string) **(required)**: The value to [`fill`](#fill) in

---

### `fill_form`

**Description:** [`Fill`](#fill) out multiple form elements at once

**Parameters:**

- **elements** (array) **(required)**: Elements from snapshot to [`fill`](#fill) out.

---

### `handle_dialog`

**Description:** If a browser dialog was opened, use this command to handle it

**Parameters:**

- **action** (enum: "accept", "dismiss") **(required)**: Whether to dismiss or accept the dialog
- **promptText** (string) _(optional)_: Optional prompt text to enter into the dialog.

---

### `hover`

**Description:** [`Hover`](#hover) over the provided element

**Parameters:**

- **uid** (string) **(required)**: The uid of an element on the page from the page content snapshot

---

### `upload_file`

**Description:** Upload a file through a provided element.

**Parameters:**

- **filePath** (string) **(required)**: The local path of the file to upload
- **uid** (string) **(required)**: The uid of the file input element or an element that will open file chooser on the page from the page content snapshot

---

## Navigation automation

### `close_page`

**Description:** Closes the page by its index. The last open page cannot be closed.

**Parameters:**

- **pageIdx** (number) **(required)**: The index of the page to close. Call [`list_pages`](#list_pages) to list pages.

---

### `list_pages`

**Description:** Get a list of pages open in the browser.

**Parameters:** None

---

### `navigate_page`

**Description:** Navigates the currently selected page to a URL.

**Parameters:**

- **timeout** (integer) _(optional)_: Maximum wait time in milliseconds. If set to 0, the default timeout will be used.
- **url** (string) **(required)**: URL to navigate the page to

---

### `navigate_page_history`

**Description:** Navigates the currently selected page.

**Parameters:**

- **navigate** (enum: "back", "forward") **(required)**: Whether to navigate back or navigate forward in the selected pages history
- **timeout** (integer) _(optional)_: Maximum wait time in milliseconds. If set to 0, the default timeout will be used.

---

### `new_page`

**Description:** Creates a new page

**Parameters:**

- **timeout** (integer) _(optional)_: Maximum wait time in milliseconds. If set to 0, the default timeout will be used.
- **url** (string) **(required)**: URL to load in a new page.

---

### `select_page`

**Description:** Select a page as a context for future tool calls.

**Parameters:**

- **pageIdx** (number) **(required)**: The index of the page to select. Call [`list_pages`](#list_pages) to list pages.

---

### `wait_for`

**Description:** Wait for the specified text to appear on the selected page.

**Parameters:**

- **text** (string) **(required)**: Text to appear on the page
- **timeout** (integer) _(optional)_: Maximum wait time in milliseconds. If set to 0, the default timeout will be used.

---

## Emulation

### `emulate_cpu`

**Description:** Emulates CPU throttling by slowing down the selected page's execution.

**Parameters:**

- **throttlingRate** (number) **(required)**: The CPU throttling rate representing the slowdown factor 1-20x. Set the rate to 1 to disable throttling

---

### `emulate_network`

**Description:** Emulates network conditions such as throttling or offline mode on the selected page.

**Parameters:**

- **throttlingOption** (enum: "No emulation", "Offline", "Slow 3G", "Fast 3G", "Slow 4G", "Fast 4G") **(required)**: The network throttling option to emulate. Available throttling options are: No emulation, Offline, Slow 3G, Fast 3G, Slow 4G, Fast 4G. Set to "No emulation" to disable. Set to "Offline" to simulate offline network conditions.

---

### `resize_page`

**Description:** Resizes the selected page's window so that the page has specified dimension

**Parameters:**

- **height** (number) **(required)**: Page height
- **width** (number) **(required)**: Page width

---

## Performance

### `performance_analyze_insight`

**Description:** Provides more detailed information on a specific Performance Insight that was highlighted in the results of a trace recording.

**Parameters:**

- **insightName** (string) **(required)**: The name of the Insight you want more information on. For example: "DocumentLatency" or "LCPBreakdown"

---

### `performance_start_trace`

**Description:** Starts a performance trace recording on the selected page. This can be used to look for performance problems and insights to improve the performance of the page. It will also report Core Web Vital (CWV) scores for the page.

**Parameters:**

- **autoStop** (boolean) **(required)**: Determines if the trace recording should be automatically stopped.
- **reload** (boolean) **(required)**: Determines if, once tracing has started, the page should be automatically reloaded.

---

### `performance_stop_trace`

**Description:** Stops the active performance trace recording on the selected page.

**Parameters:** None

---

## Network

### `get_network_request`

**Description:** Gets a network request by URL. You can get all requests by calling [`list_network_requests`](#list_network_requests).

**Parameters:**

- **url** (string) **(required)**: The URL of the request.

---

### `list_network_requests`

**Description:** List all requests for the currently selected page since the last navigation.

**Parameters:**

- **pageIdx** (integer) _(optional)_: Page number to return (0-based). When omitted, returns the first page.
- **pageSize** (integer) _(optional)_: Maximum number of requests to return. When omitted, returns all requests.
- **resourceTypes** (array) _(optional)_: Filter requests to only return requests of the specified resource types. When omitted or empty, returns all requests.

---

## Debugging

### `evaluate_script`

**Description:** Evaluate a JavaScript function inside the currently selected page. Returns the response as JSON
so returned values have to JSON-serializable.

**Parameters:**

- **args** (array) _(optional)_: An optional list of arguments to pass to the function.
- **function** (string) **(required)**: A JavaScript function to run in the currently selected page.
Example without arguments: `() => {
  return document.title
}` or `async () => {
  return await fetch("example.com")
}`.
Example with arguments: `(el) => {
  return el.innerText;
}`


---

### `list_console_messages`

**Description:** List all console messages for the currently selected page since the last navigation.

**Parameters:** None

---

### `take_screenshot`

**Description:** Take a screenshot of the page or element.

**Parameters:**

- **filePath** (string) _(optional)_: The absolute path, or a path relative to the current working directory, to save the screenshot to instead of attaching it to the response.
- **format** (enum: "png", "jpeg", "webp") _(optional)_: Type of format to save the screenshot as. Default is "png"
- **fullPage** (boolean) _(optional)_: If set to true takes a screenshot of the full page instead of the currently visible viewport. Incompatible with uid.
- **quality** (number) _(optional)_: Compression quality for JPEG and WebP formats (0-100). Higher values mean better quality but larger file sizes. Ignored for PNG format.
- **uid** (string) _(optional)_: The uid of an element on the page from the page content snapshot. If omitted takes a pages screenshot.

---

### `take_snapshot`

**Description:** Take a text snapshot of the currently selected page. The snapshot lists page elements along with a unique
identifier (uid). Always use the latest snapshot. Prefer taking a snapshot over taking a screenshot.

**Parameters:** None

---

## Extension debugging

### `evaluate_in_extension`

**Description:** Evaluate JavaScript code in an extension context.

Executes arbitrary JavaScript in the extension's background context (Service Worker for MV3, 
background page for MV2). This is essential for:
- Testing extension APIs (chrome.runtime, chrome.storage, etc.)
- Debugging extension logic
- Inspecting extension state
- Calling extension functions

The code runs with full extension permissions and has access to all chrome.* APIs.

**Parameters:**

- **code** (string) **(required)**: JavaScript code to execute in the extension context. Can be async.
- **contextId** (string) _(optional)_: Specific context ID to execute in. If not provided, uses the background context.
- **extensionId** (string) **(required)**: Extension ID. Get this from [`list_extensions`](#list_extensions).

---

### `get_extension_details`

**Description:** Get detailed information about a specific Chrome extension.

Retrieves comprehensive metadata including manifest details, permissions, host permissions,
background script information, and extension status. Use this after [`list_extensions`](#list_extensions) to get
more detailed information about a particular extension.

**Parameters:**

- **extensionId** (string) **(required)**: Extension ID (32 lowercase letters). Get this from [`list_extensions`](#list_extensions).

---

### `get_extension_logs`

**Description:** Get console logs from a Chrome extension.

Captures console output from different extension contexts:
- Background script / Service Worker logs
- Content script logs (if running in tabs)
- Popup and options page logs

This is essential for debugging extension behavior without manually opening DevTools.
Logs are color-coded by level (error, warning, info, log, debug) for easy identification.

**Parameters:**

- **extensionId** (string) **(required)**: Extension ID to get logs from. Get this from [`list_extensions`](#list_extensions).
- **level** (array) _(optional)_: Log levels to include. If not specified, returns all levels.
- **limit** (number) _(optional)_: Maximum number of log entries to return. Default is 50.
- **since** (number) _(optional)_: Only return logs since this timestamp (milliseconds since epoch). Useful for incremental log collection.

---

### `inspect_extension_storage`

**Description:** Inspect extension storage (local, sync, session, or managed).

Retrieves data from the specified storage area of a Chrome extension using chrome.storage API.
Shows storage quota, usage, and all stored key-value pairs. This is essential for debugging
data persistence issues in extensions.

Storage types:
- local: 5MB quota, persists across browser restarts
- sync: 100KB quota, syncs across devices signed into same account
- session: 10MB quota, cleared when browser closes (MV3 only)
- managed: Enterprise-managed storage (read-only for extension)

**Parameters:**

- **extensionId** (string) **(required)**: Extension ID (32 lowercase letters)
- **storageType** (enum: "local", "sync", "session", "managed") _(optional)_: Storage type to inspect. Default is "local". session is only available in MV3.

---

### `list_extension_contexts`

**Description:** List all execution contexts for a Chrome extension.

This includes:
- Background context (Service Worker for MV3, Background Page for MV2)
- Popup windows
- Options pages  
- DevTools pages
- Content scripts

Use this to understand all running contexts of an extension before debugging.
Each context has a unique Target ID that can be used with [`switch_extension_context`](#switch_extension_context).

**Parameters:**

- **extensionId** (string) **(required)**: Extension ID to inspect. Get this from [`list_extensions`](#list_extensions).

---

### `list_extensions`

**Description:** List all installed Chrome extensions with their metadata.

This tool discovers extensions by scanning Chrome targets and retrieving their manifest information.
Shows extension ID, name, version, manifest version, permissions, and enabled status.
Useful for understanding which extensions are installed and active in the current browser session.

**Parameters:**

- **includeDisabled** (boolean) _(optional)_: Whether to include disabled extensions in the results. Default is false.

---

### `monitor_extension_messages`

**Description:** Monitor extension message passing in real-time.

Captures chrome.runtime.sendMessage, chrome.tabs.sendMessage calls and chrome.runtime.onMessage events.
Useful for debugging communication between different parts of an extension (background, content scripts, popup).

**Monitored events**:
- runtime.sendMessage - Messages sent via runtime API
- tabs.sendMessage - Messages sent to specific tabs
- runtime.onMessage - Messages received by the extension

**Usage tips**:
- Start monitoring before triggering the action you want to debug
- Default duration is 30 seconds
- Messages are captured in chronological order
- Sender information includes tab, URL, and frame details

**Parameters:**

- **duration** (number) _(optional)_: Monitoring duration in milliseconds. Default is 30000 (30 seconds).
- **extensionId** (string) **(required)**: Extension ID (32 lowercase letters)
- **messageTypes** (array) _(optional)_: Types of messages to monitor. Default is ["runtime", "tabs"].

---

### `reload_extension`

**Description:** Reload a Chrome extension.

Forces the extension to reload, similar to clicking the reload button in chrome://extensions.
This is useful after modifying extension files during development or to reset extension state.

Note: Reloading will:
- Close all extension contexts (popup, options, devtools)
- Restart the background script/service worker
- Re-inject content scripts
- Clear extension's in-memory state

**Parameters:**

- **extensionId** (string) **(required)**: Extension ID to reload. Get this from [`list_extensions`](#list_extensions).

---

### `switch_extension_context`

**Description:** Switch the active context to a specific extension context.

After switching, operations like [`evaluate_in_extension`](#evaluate_in_extension) will run in the selected context.
This is essential for debugging different parts of an extension:
- Switch to background/service worker for background logic
- Switch to popup for UI code
- Switch to content script for page interaction code

Use [`list_extension_contexts`](#list_extension_contexts) first to get available Target IDs.

**Parameters:**

- **extensionId** (string) **(required)**: Extension ID. Get this from [`list_extensions`](#list_extensions).
- **targetId** (string) **(required)**: Target ID of the context to switch to. Get this from [`list_extension_contexts`](#list_extension_contexts).

---

### `trace_extension_api_calls`

**Description:** Track chrome.* API calls made by an extension.

**Note**: This is a simplified version that primarily tracks message-related APIs.
For full API tracing, use browser DevTools Performance profiler.

**Tracked APIs**:
- chrome.runtime.sendMessage
- chrome.tabs.sendMessage
- chrome.runtime.onMessage

**Use cases**:
- Understand extension's communication patterns
- Debug message flow between components
- Identify excessive API usage

**Parameters:**

- **apiFilter** (array) _(optional)_: API categories to track. Currently supports ["runtime", "tabs"].
- **duration** (number) _(optional)_: Monitoring duration in milliseconds. Default is 30000 (30 seconds).
- **extensionId** (string) **(required)**: Extension ID (32 lowercase letters)

---

### `watch_extension_storage`

**Description:** Watch extension storage changes in real-time.

Monitors chrome.storage.onChanged events to track data modifications.
Useful for debugging data persistence, state management, and synchronization issues.

**Supported storage types**:
- local: Local storage (5MB quota)
- sync: Sync storage (100KB quota, syncs across devices)
- session: Session storage (10MB quota, MV3 only)
- managed: Managed storage (enterprise, read-only)

**Captured information**:
- Timestamp of each change
- Storage area (local/sync/session/managed)
- Changed keys with old and new values

**Usage tips**:
- Start monitoring before making storage changes
- Default duration is 30 seconds
- Multiple storage types can be monitored simultaneously
- Changes are captured in real-time with timestamps

**Parameters:**

- **duration** (number) _(optional)_: Monitoring duration in milliseconds. Default is 30000 (30 seconds).
- **extensionId** (string) **(required)**: Extension ID (32 lowercase letters)
- **storageTypes** (array) _(optional)_: Storage types to monitor. Default is ["local"].

---
