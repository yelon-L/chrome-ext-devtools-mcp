/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {
  ToolCategories,
  TOOL_CATEGORY_LABELS,
  TOOL_CATEGORY_DESCRIPTIONS,
} from '../../src/tools/categories.js';

describe('ToolCategories', () => {
  describe('enum values', () => {
    it('uses lowercase snake_case format', () => {
      const values = Object.values(ToolCategories);
      for (const value of values) {
        assert.match(value, /^[a-z_]+$/);
      }
    });

    it('has all expected categories', () => {
      const expected = [
        'input_automation',
        'navigation_automation',
        'emulation',
        'performance',
        'network',
        'debugging',
        'extension_discovery',
        'extension_lifecycle',
        'extension_debugging',
        'extension_interaction',
        'extension_monitoring',
        'extension_inspection',
        'browser_info',
      ];

      const actual = Object.values(ToolCategories);
      assert.deepStrictEqual(actual.sort(), expected.sort());
    });
  });

  describe('TOOL_CATEGORY_LABELS', () => {
    it('has label for every category', () => {
      const categories = Object.values(ToolCategories);
      for (const category of categories) {
        assert.ok(
          TOOL_CATEGORY_LABELS[category],
          `Missing label for category: ${category}`,
        );
      }
    });

    it('labels are human-readable strings', () => {
      const labels = Object.values(TOOL_CATEGORY_LABELS);
      for (const label of labels) {
        assert.ok(typeof label === 'string');
        assert.ok(label.length > 0);
        // Should start with capital letter
        assert.match(label, /^[A-Z]/);
      }
    });

    it('has correct number of labels', () => {
      const categoryCount = Object.keys(ToolCategories).length;
      const labelCount = Object.keys(TOOL_CATEGORY_LABELS).length;
      assert.strictEqual(labelCount, categoryCount);
    });
  });

  describe('TOOL_CATEGORY_DESCRIPTIONS', () => {
    it('has description for every category', () => {
      const categories = Object.values(ToolCategories);
      for (const category of categories) {
        assert.ok(
          TOOL_CATEGORY_DESCRIPTIONS[category],
          `Missing description for category: ${category}`,
        );
      }
    });

    it('descriptions are meaningful strings', () => {
      const descriptions = Object.values(TOOL_CATEGORY_DESCRIPTIONS);
      for (const desc of descriptions) {
        assert.ok(typeof desc === 'string');
        assert.ok(desc.length > 10, 'Description should be meaningful');
      }
    });

    it('has correct number of descriptions', () => {
      const categoryCount = Object.keys(ToolCategories).length;
      const descCount = Object.keys(TOOL_CATEGORY_DESCRIPTIONS).length;
      assert.strictEqual(descCount, categoryCount);
    });
  });

  describe('category mapping consistency', () => {
    it('all enum keys have corresponding labels and descriptions', () => {
      const categories = Object.values(ToolCategories);

      for (const category of categories) {
        assert.ok(
          TOOL_CATEGORY_LABELS[category],
          `Missing label for ${category}`,
        );
        assert.ok(
          TOOL_CATEGORY_DESCRIPTIONS[category],
          `Missing description for ${category}`,
        );
      }
    });

    it('no extra labels or descriptions', () => {
      const categories = new Set(Object.values(ToolCategories));

      for (const key of Object.keys(TOOL_CATEGORY_LABELS)) {
        assert.ok(
          categories.has(key as ToolCategories),
          `Extra label for unknown category: ${key}`,
        );
      }

      for (const key of Object.keys(TOOL_CATEGORY_DESCRIPTIONS)) {
        assert.ok(
          categories.has(key as ToolCategories),
          `Extra description for unknown category: ${key}`,
        );
      }
    });
  });

  describe('extension-specific categories', () => {
    it('has all 6 extension categories', () => {
      const extensionCategories = [
        ToolCategories.EXTENSION_DISCOVERY,
        ToolCategories.EXTENSION_LIFECYCLE,
        ToolCategories.EXTENSION_DEBUGGING,
        ToolCategories.EXTENSION_INTERACTION,
        ToolCategories.EXTENSION_MONITORING,
        ToolCategories.EXTENSION_INSPECTION,
      ];

      assert.strictEqual(extensionCategories.length, 6);

      for (const category of extensionCategories) {
        assert.ok(category.startsWith('extension_'));
      }
    });

    it('extension categories have descriptive labels', () => {
      const extensionCategories = [
        ToolCategories.EXTENSION_DISCOVERY,
        ToolCategories.EXTENSION_LIFECYCLE,
        ToolCategories.EXTENSION_DEBUGGING,
        ToolCategories.EXTENSION_INTERACTION,
        ToolCategories.EXTENSION_MONITORING,
        ToolCategories.EXTENSION_INSPECTION,
      ];

      for (const category of extensionCategories) {
        const label = TOOL_CATEGORY_LABELS[category];
        assert.ok(label.includes('Extension'));
      }
    });
  });
});
