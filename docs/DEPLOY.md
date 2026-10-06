# karst — website deployment runbook

How the project's static website (`landing/`) is put on its own domain. This is
about the website only. The karst CLI and MCP server are installed from PyPI and
need no deployment; they send nothing to any server of ours.

> The project's admin dashboard (waitlist viewer, feedback inbox) is not part of
> this repository, and karst does not talk to it.

## 1. Domain & DNS

Register **`karst.dev`** (Porkbun, Cloudflare Registrar, Namecheap — any TLD-supporting registrar).

DNS records:

| Type | Host | Value | Purpose |
|---|---|---|---|
| `A` | `@` (apex) | Vercel anycast IP `76.76.21.21` | Landing site at `karst.dev`. |
| `CNAME` | `www` | `cname.vercel-dns.com` | `www.karst.dev` -> landing. |

TTL 300 while setting up; bump to 3600 once stable.

## 2. Splitting the landing page out of the main repo

> **Status: not done — optional.** Today the landing is deployed to Vercel
> straight from this monorepo (no separate repo, no split), and that works
> fine. This section is the plan for *if* you later want the landing in its own
> repo. Skip it otherwise — §3 below describes the actual setup.

Extract `landing/` into its own repo.

### Option A — `git filter-repo` (clean history, recommended)

```bash
# from a fresh clone of the repo
git clone git@github.com:you/karst.git karst-landing-extract
cd karst-landing-extract

# install: pipx install git-filter-repo  (or: pip install git-filter-repo)
git filter-repo --path landing --path-rename landing/:

# push to a new empty repo
git remote add origin git@github.com:you/karst-landing.git
git branch -M main
git push -u origin main
```

Result: a repo whose root is what used to be `landing/`, with only the commits that touched those files.

### Option B — `git subtree split` (simpler, keeps merge commits)

```bash
# from the repo, on main
git subtree split --prefix=landing -b landing-main

# push that branch to a new repo
git push git@github.com:you/karst-landing.git landing-main:main
```

Faster, no extra tooling, but history is less tidy. Fine for a landing page.

After either option, delete `landing/` from the main repo in a follow-up commit so it doesn't drift.

## 3. Deploying landing to Vercel

1. Vercel dashboard -> **Add New -> Project** -> import the monorepo and set **Root Directory** to `landing` (or import the standalone `karst-landing` repo if you did the optional split in §2).
2. Framework preset: **Other** — the landing is static HTML (`index.html` + `vercel.json`), no build step.
3. **Build command**: leave default/empty. No env vars needed; it's static.
4. Deploy.
5. **Settings -> Domains -> Add** `karst.dev` and `www.karst.dev`. Vercel will show the A/CNAME records it expects — they match the table in section 1.
6. Wait for the cert (auto, ~1 min).

The landing's waitlist, feedback and quote forms post what a visitor types to a
separately hosted backend that is not part of this repository. That is a
website feature only; the CLI never calls it. Where those forms point is set at
the bottom of `landing/index.html` (see `landing/README.md`).

## 4. Year-1 cost breakdown

| Item | Cost |
|---|---|
| Domain (`karst.dev`, 1 year) | $12 |
| Vercel (landing, Hobby tier) | $0 |
| PyPI (CLI distribution) | $0 |
| GitHub (repo on free tier) | $0 |
| **Total** | **~$12/year** |

The landing runs on Vercel's free **Hobby** tier, so hosting is effectively $0 —
the only hard cost is the domain. Note that Hobby is non-commercial: a real
commercial launch moves the site to Vercel **Pro** (~$20/mo).
