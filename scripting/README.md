# Scripting — plan gate-keeper

## Language

Implemented in Node.js (`script.js`), not Python. The original `script.py`
has been left in place as a pointer, per the case study's own note that any
language is acceptable as long as execution instructions are provided.

## What it does

Reads one or more Terraform plan JSON files (`terraform show -json plan.out`)
and decides whether `terraform apply` should proceed, using this policy:

- `create` and `no-op` resource changes are always fine.
- `update` resource changes are fine **only if** the sole thing that changed
  is the `tags` attribute, and the sole tag key that changed is
  `GitCommitHash`.
- Any `delete`, or replace (`delete` + `create`), blocks the apply.
- Any other attribute change, or any other tag key change, blocks the apply.

Computed/provider-known-after-apply attributes (Terraform's `after_unknown`
map) are excluded from the diff, since those aren't something the plan
"modified" — they're not resolvable until apply runs.

For every blocked resource, the script prints the exact corrective action
required (which attribute/tag to revert).

Exit code is `0` if every given plan may proceed, `1` if any plan is
blocked — suitable for a CI gate.

## Run it

```bash
node script.js tfplan-1.json tfplan-2.json tfplan-3.json
```

## Result against the fixtures in this folder

```
[PROCEED] tfplan-1.json — 1 resource change(s), all within policy.
[PROCEED] tfplan-2.json — 0 resource change(s), all within policy.
[BLOCKED] tfplan-3.json — 2 violation(s) of 7 change(s):
  - module.aihub.azapi_resource.hub: modifies tag(s) [__SYSTEM__AIServices_aisaihubconnection, __SYSTEM__AzureOpenAI_aisaihubconnection_aoai, __SYSTEM__CognitiveSearch_aisearch-services-connection] ...
  - module.aihub.azapi_resource.project: modifies non-tag attribute(s) [body]. ...
```

`tfplan-3.json` is correctly blocked: it hides a real config change
(`body.properties.friendlyName`) alongside tag churn, and separately drops
three unrelated system tags from the `hub` resource without touching
`GitCommitHash` at all.
