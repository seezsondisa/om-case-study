# Deleting the "2nd" resource of a `count`-based set without touching the others

## The problem

```hcl
variable "files" {
  default = 5
}

resource "local_file" "foo" {
  count    = var.files
  content  = "# Some content for file ${count.index}"
  filename = "file${count.index}.txt"
}
```

With `count`, Terraform identifies each instance by its **position**:
`local_file.foo[0]` … `local_file.foo[4]`. That index is not a label you
chose — it's assigned by ordinal position in the list. If you simply lower
`count` to 4, or otherwise shift the list, Terraform doesn't know you meant
"remove the middle one" — it diffs by index, so every instance *after* the
one you wanted gone (`[2]`, `[3]`, `[4]`) gets destroyed and recreated with a
new identity, even though their actual desired content never changed. For 5
resources that's 3 unnecessary destroy/recreate cycles to remove 1 resource.

Manually deleting the underlying resource and renumbering the rest works,
but it is **not** what we want here: it is slow at scale, it is destructive
to the resources whose index shifts, and for anything with real state (a
database, a running VM, a dependent downstream resource) that destroy/create
cycle can mean real data loss or downtime — not just a reshuffle.

## The fix: move off positional identity (`count`) onto stable identity (`for_each`)

1. **Move each resource you want to KEEP in Terraform's state to a
   `for_each`-shaped address**, using `terraform state mv` — this only edits
   the state file's bookkeeping; it does not touch the real resource at all:

   ```bash
   terraform state mv 'local_file.foo[0]' 'local_file.foo["0"]'
   terraform state mv 'local_file.foo[1]' 'local_file.foo["1"]'
   terraform state mv 'local_file.foo[3]' 'local_file.foo["3"]'
   terraform state mv 'local_file.foo[4]' 'local_file.foo["4"]'
   ```

   Deliberately **do not** move `local_file.foo[2]` — leaving it un-migrated
   is what marks it for removal in the next step. This must happen *before*
   editing the `.tf` config: if you edit the config first, `terraform plan`
   sees a config that doesn't match any state address at all and will try to
   destroy everything and recreate from scratch.

2. **Rewrite the resource to use `for_each` over a stable key set that
   excludes the one you're dropping**, instead of `count`:

   ```hcl
   variable "file_keys" {
     default = ["0", "1", "3", "4"]
   }

   resource "local_file" "foo" {
     for_each = toset(var.file_keys)
     content  = "# Some content for file ${each.key}"
     filename = "file${each.key}.txt"
   }
   ```

   `each.key` plays the same role `count.index` used to, but as a stable
   string key instead of a shifting ordinal position.

3. **Plan.** Because the 4 survivors were already re-pointed to their new
   `for_each` addresses in state, and `local_file.foo[2]` now matches nothing
   in config, the plan shows exactly one action:

   ```
   # local_file.foo[2] will be destroyed
   # (because resource does not use count)
   Plan: 0 to add, 0 to change, 1 to destroy.
   ```

4. **Apply.** Only the one resource is destroyed.

5. **Plan again** — `terraform apply` now reports:

   ```
   No changes. Your infrastructure matches the configuration.
   ```

## Verified against this repo's real `local_file.foo` resources

This was run end-to-end against the actual `main.tf`/state in this folder,
not just described:

- Before: `local_file.foo[0..4]`, files `file0.txt`…`file4.txt` all present.
- `terraform state mv` ×4 (0, 1, 3, 4 → string keys; `[2]` left behind).
- `main.tf` updated to the `for_each` form above.
- `terraform plan` → `0 to add, 0 to change, 1 to destroy` (only `foo[2]`).
- `terraform apply` → `Apply complete! Resources: 0 added, 0 changed, 1 destroyed.`
- Result: `file2.txt` deleted; `file0.txt`, `file1.txt`, `file3.txt`,
  `file4.txt` untouched (unchanged content, unchanged mtimes — they were
  never destroyed or recreated).
- Final `terraform plan` → `No changes. Your infrastructure matches the configuration.`

## Why `for_each` over `count` here, generally

`count`'s index is **positional** identity — fragile, because removing or
inserting an element anywhere but the end reshuffles everything after it.
`for_each`'s key is **intrinsic** identity — tied to something meaningful
about the resource itself, so removing one element never disturbs the
others. This is the same reason relational data modelling favours a stable
surrogate/natural key over an array index or auto-incrementing position
for anything referenced elsewhere (foreign keys, replication, downstream
systems): positional identity only survives as long as nothing before it
ever changes.
