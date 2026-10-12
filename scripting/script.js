#!/usr/bin/env node
/**
 * Gate-keeper for a Terraform plan (JSON form, i.e. `terraform show -json plan.out`).
 *
 * Rule: the apply may proceed only if every resource change is either
 *   - a create, or
 *   - an update that touches ONLY the `tags` attribute, and within `tags`
 *     ONLY the `GitCommitHash` key.
 * Any destroy, replace (delete+create), or any other attribute/tag change
 * blocks the apply. Every violation is printed with the exact corrective
 * action required.
 *
 * Usage:
 *   node script.js <path-to-tfplan.json> [...moreFiles]
 *
 * Exit code: 0 if every file's plan may proceed, 1 if any plan is blocked.
 */

const fs = require('fs');
const path = require('path');

const ALLOWED_ACTION_SETS = [
  ['no-op'],
  ['create'],
  ['update'],
];

function actionsKey(actions) {
  return [...actions].sort().join(',');
}

const ALLOWED_KEYS = new Set(ALLOWED_ACTION_SETS.map(actionsKey));

/**
 * Diff the top-level keys of two attribute objects, skipping any key whose
 * post-apply value is not yet known (Terraform's `after_unknown` map) —
 * those are provider-computed values, not something the plan "modified".
 */
function diffTopLevelKeys(before, after, afterUnknown) {
  before = before || {};
  after = after || {};
  afterUnknown = afterUnknown || {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changed = [];
  for (const key of keys) {
    if (afterUnknown[key] === true) continue; // computed, unknown until apply
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      changed.push(key);
    }
  }
  return changed;
}

/** Diff two `tags` maps (either may be null/undefined) down to the key level. */
function diffTagKeys(beforeTags, afterTags) {
  const before = beforeTags || {};
  const after = afterTags || {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changed = [];
  for (const key of keys) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      changed.push(key);
    }
  }
  return changed;
}

/**
 * Evaluate a single resource_change. Returns null if it is safe to apply,
 * or a human-readable required-action string if it is not.
 */
function evaluateResourceChange(rc) {
  const address = rc.address;
  const actions = rc.change.actions;
  const key = actionsKey(actions);

  if (!ALLOWED_KEYS.has(key)) {
    // Covers delete, and any replace (delete+create / create+delete).
    return `${address}: plan action is [${actions.join(', ')}] — destroys ` +
      `the existing resource. Required action: remove/avoid whatever ` +
      `config change is forcing a destroy or replacement of this resource.`;
  }

  if (key !== 'update') {
    return null; // no-op / create — always fine
  }

  const changedTopLevel = diffTopLevelKeys(
    rc.change.before,
    rc.change.after,
    rc.change.after_unknown,
  );

  const nonTagChanges = changedTopLevel.filter((k) => k !== 'tags');
  if (nonTagChanges.length > 0) {
    return `${address}: modifies non-tag attribute(s) [${nonTagChanges.join(', ')}]. ` +
      `Required action: revert ${nonTagChanges.join(', ')} back to its current value ` +
      `so only tags.GitCommitHash changes.`;
  }

  if (!changedTopLevel.includes('tags')) {
    // update action but nothing actually differs at the top level — treat as a no-op.
    return null;
  }

  const changedTagKeys = diffTagKeys(rc.change.before.tags, rc.change.after.tags);
  const disallowedTagKeys = changedTagKeys.filter((k) => k !== 'GitCommitHash');
  if (disallowedTagKeys.length > 0) {
    return `${address}: modifies tag(s) [${disallowedTagKeys.join(', ')}] in addition to ` +
      `(or instead of) GitCommitHash. Required action: revert tag(s) ` +
      `[${disallowedTagKeys.join(', ')}] back to their current value — only the ` +
      `GitCommitHash tag may change.`;
  }

  return null; // only tags.GitCommitHash changed — safe
}

function evaluatePlanFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const plan = JSON.parse(raw);
  const resourceChanges = plan.resource_changes || [];

  const violations = [];
  for (const rc of resourceChanges) {
    const violation = evaluateResourceChange(rc);
    if (violation) violations.push(violation);
  }

  return { filePath, violations, resourceCount: resourceChanges.length };
}

function main(argv) {
  if (argv.length === 0) {
    console.error('Usage: node script.js <path-to-tfplan.json> [...moreFiles]');
    process.exit(2);
  }

  let anyBlocked = false;

  for (const filePath of argv) {
    const { violations, resourceCount } = evaluatePlanFile(filePath);
    const name = path.basename(filePath);

    if (violations.length === 0) {
      console.log(`[PROCEED] ${name} — ${resourceCount} resource change(s), all within policy.`);
    } else {
      anyBlocked = true;
      console.log(`[BLOCKED] ${name} — ${violations.length} violation(s) of ${resourceCount} change(s):`);
      for (const v of violations) {
        console.log(`  - ${v}`);
      }
    }
  }

  process.exit(anyBlocked ? 1 : 0);
}

main(process.argv.slice(2));
