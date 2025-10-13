/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 扩展调试工具统一导出
 */

export {listExtensions, getExtensionDetails} from './discovery.js';
export {listExtensionContexts, switchExtensionContext} from './contexts.js';
export {inspectExtensionStorage} from './storage.js';
export {getExtensionLogs} from './logs.js';
export {evaluateInExtension, reloadExtension} from './execution.js';
export {activateExtensionServiceWorker} from './service-worker-activation.js';

// Phase 1: 新增高价值功能
export {diagnoseExtensionErrors} from './diagnostics.js';
export {inspectExtensionManifest} from './manifest-inspector.js';
export {checkContentScriptInjection} from './content-script-checker.js';
