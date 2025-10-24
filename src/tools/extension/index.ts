/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Extension debugging tools unified exports
 */

export {listExtensions, getExtensionDetails} from './discovery.js';
export {listExtensionContexts, switchExtensionContext} from './contexts.js';
export {inspectExtensionStorage} from './storage.js';
export {getExtensionLogs} from './logs.js';
export {evaluateInExtension, reloadExtension, clearExtensionErrors} from './execution.js';
export {activateExtensionServiceWorker} from './service-worker-activation.js';

// Phase 1: New high-value features
export {diagnoseExtensionErrors} from './diagnostics.js';
export {inspectExtensionManifest} from './manifest-inspector.js';
export {checkContentScriptInjection} from './content-script-checker.js';
export {enhanceExtensionErrorCapture} from './error-capture-enhancer.js';
export {getExtensionRuntimeErrors} from './runtime-errors.js';

// Popup lifecycle management tools
export {
  openExtensionPopup,
  isPopupOpen,
  waitForPopup,
  closePopup,
  getPopupInfo,
  interactWithPopup,
} from './popup-lifecycle.js';
