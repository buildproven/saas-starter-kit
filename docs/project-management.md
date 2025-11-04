# Project Management Operating Model

This document captures how we organize work across GitHub Projects, labels, and pull request automation for the SaaS starter template. The goals are to keep roadmap execution visible, reduce triage overhead, and ensure every change ships with the required quality checks.

## 1. GitHub Project Board

- **Project type:** _Projects_ (beta) board named `SaaS Starter – Delivery`.
- **Views:**
  - `Delivery Board` (board view) with columns `Backlog`, `Ready`, `In Progress`, `In Review`, `Blocked`, `Done`.
  - `Quarterly Goals` (table view) grouped by the `phase` custom field.
  - `Bugs` (board view) filtered to `type = bug`.
- **Fields:**
  - `phase` (`Phase 0`, `Phase 1`, `Phase 2`, `Phase 3`, `Phase 4`, `Backlog`).
  - `priority` (`P0`, `P1`, `P2`, `P3`).
  - `status` (mirrors column state; keeps automations intact).
  - `target release` (iteration field using two-week cadence).
- **Automations:**
  - New issues enter `Backlog` with status `Backlog`.
  - When status changes to `In Progress`, assignee is auto-set to card owner.
  - When a PR is merged, move linked issue to `Done`.
  - When a card is in `Blocked`, post a daily comment reminder to the owner (configure via workflow).

> Tip: use `gh project copy` to duplicate this structure into staging/testing environments before enabling in production.

## 2. Label Taxonomy

Create the following labels (hex colours in parentheses):

| Label | Description | Colour |
| --- | --- | --- |
| `bug` | Reproducible defect impacting end users. | `#d73a4a` |
| `enhancement` | Product improvement or feature request. | `#a2eeef` |
| `chore` | Internal maintenance (deps, refactors). | `#cfd3d7` |
| `needs-triage` | Awaiting review; auto-applied via templates. | `#fbca04` |
| `phase-0` … `phase-4` | Track phase alignment with the roadmap. | `#5319e7` (re-use), adjust shade if desired. |
| `blocked` | Requires external input before progressing. | `#b60205` |
| `security` | Security-sensitive change or report. | `#000000` |

> Use `gh label create` with the colour codes above to bootstrap the repo (`scripts/github-labels.json` can be generated from this table if desired).

## 3. Issue Templates

We ship two guided templates (`Bug Report`, `Feature Request`) under `.github/ISSUE_TEMPLATE`. They:
- Pre-apply `needs-triage`.
- Capture environment, impact, and dependencies early.
- Encourage linking to roadmap phases using the `phase-*` labels.

If a contributor needs to open an infrastructure or security-only issue, direct them to the Security Policy contact link exposed via `config.yml`.

## 4. Pull Request Template

`.github/PULL_REQUEST_TEMPLATE.md` enforces:
- Summary of the change & roadmap linkage.
- Verification of quality checks (`npm run lint`, `npm run typecheck`, `npm test`).
- Deployment readiness checklist (migrations, feature flags, monitoring).

Encourage contributors to keep the checklist ticked in the final PR update. For automation, add a branch protection rule requiring all three checks to pass.

## 5. Integrations & Workflows

1. Install the [GitHub Actions – Projects](https://github.com/marketplace/actions/actions-add-to-project) action in CI to auto-add PRs/issues to the project:
   ```yaml
   - name: Add pull request to roadmap board
     uses: actions/add-to-project@v0.5.0
     with:
       project-url: https://github.com/orgs/<org>/projects/<id>
       github-token: ${{ secrets.PROJECTS_TOKEN }}
   ```
2. Add a repository rule requiring:
   - Linear history (squash merges).
   - Passing checks from `Quality Checks` workflow.
   - Linked issue reference (enforce via PR template review).

3. Configure the roadmap milestones (`Phase 0 – Stabilize & Docs`, `Phase 1 – Monetization Foundations`, etc.) and map them to the `phase-*` labels for easy filtering.

## 6. Getting Started Checklist

1. Create the project board with fields/columns above.
2. Run `gh label create` for each label (or script via `gh api`).
3. Commit the provided templates (this repo).
4. Update branch protection to require the lint/typecheck/test checks.
5. Communicate the workflow in `docs/project-management.md` (this file) and link it from `CONTRIBUTING.md` (TODO when finalizing documentation pass).

Once complete, Phase 0 governance ensures every PR is visible, triaged, and validated before moving into Phase 1 monetization work.
