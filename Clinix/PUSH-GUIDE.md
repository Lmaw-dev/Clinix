# Push Guide — Branch Workflow

Complete sequence for pushing changes using a branch, merging into `main`, and
cleaning up afterward. Run all commands from the project folder (`C:\Clinix\Clinix`).

Replace `feature/my-change` with a name that describes your work
(e.g. `feature/staff-role`, `fix/login-bug`).

---

## Full sequence

```bash
# ── 1. Start from the latest main ──
git switch main
git pull origin main

# ── 2. Create + switch to your work branch ──
git switch -c feature/my-change

#   ... make your code edits ...

# ── 3. Stage all changes (build folders are ignored, so this is safe) ──
git add .

# ── 4. Check what's staged (optional) ──
git status

# ── 5. Commit ──
git commit -m "Short description of what you changed"

# ── 6. Push the branch to GitHub ──
git push -u origin feature/my-change

# ── 7. Move BACK to the main branch ──
git switch main

# ── 8. Merge your branch into main ──
git merge feature/my-change

# ── 9. Push the updated main to GitHub ──
git push origin main

# ── 10. Delete the branch (after successful merge) ──
git branch -d feature/my-change            # local branch
git push origin --delete feature/my-change # branch on GitHub
```

---

## The flow in words

create branch → edit → `add` → `commit` → push branch →
switch back to main (7) → merge branch into main (8) → push main (9) →
delete the branch (10).

## Notes

- **Only the first push** of a branch needs `-u` (step 6). Later pushes on the
  same branch are just `git push`.
- **`git add .` is safe** here — `node_modules/`, `dist/`, and
  `frontend/build-check/` are in `.gitignore`, so build junk is never committed.
- **Step 10, lowercase `-d`** is a safe delete (only works if truly merged).
  If git says "not fully merged" even after you merged in step 8, that's a quirk
  where it compares against `origin/feature/my-change`. Since you merged locally,
  `-d` should work; if not, use capital `-D` to force it. Deleting a branch only
  removes the label — your merged code stays safe on `main`.
- **Never delete `main`.** It is the permanent trunk. Only delete finished
  feature branches.

## Alternative: merge via GitHub Pull Request (safer for review)

Instead of steps 7–9, after pushing the branch (step 6):

1. Go to https://github.com/Lmaw-dev/Clinix/pulls → **Compare & pull request**
2. Base = `main`, compare = `feature/my-change` → **Create pull request** → **Merge**
3. Sync local main: `git switch main && git pull origin main`
4. Delete the branch (step 10).
