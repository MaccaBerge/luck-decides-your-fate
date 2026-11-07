# Deploying Luck Decides Your Fate

A step-by-step guide for putting the site live on Railway behind Cloudflare, written for a first deployment. Do the sections in order, and don't skip the checks.

**What you'll end up with:**

```
luckdecideyourfate.com ─┐
www.luckdecideyourfate.com ─┼─ Cloudflare 301 redirect (keeps path + query) ─┐
www.luckdecidesyourfate.com ─┘                                               ▼
                                     luckdecidesyourfate.com ──HTTPS──► Cloudflare DNS ──► Railway
                                                                                     │
                                                                  one Docker container (1 replica)
                                                                  FastAPI + built React frontend
                                                                                     │
                                                                  Railway volume mounted at /data
                                                                  (/data/luckdecidesyourfate.db)
```

**Three things to know first:**
- **Always exactly 1 replica.** Live connections, spin locks, admin logins and the login rate limiter are kept in the app's memory, so a second copy of the app would break them.
- **Every deploy restarts the app.** Open wheels reconnect by themselves, and you have to log in to the admin again. That's expected.
- **Merging to `main` deploys.** Avoid merging in the middle of a party.

## 1. Before deploying

1. Merge the v1.1 PR. CI must be green on `main`.
2. Generate a long random admin password (32+ characters from a password manager) and store it there.

## 2. Railway

1. New Project → **Deploy from GitHub repo** → select the repo. It builds from the root `Dockerfile`.
2. In the service settings, set:
   - **Region:** an EU region (closest to Norway)
   - **Replicas:** 1 (never more)
   - **Health check path:** `/api/health`
   - **Auto-deploy:** from the `main` branch
3. **Add a volume** to the service, mounted at **`/data`**. This is where the database lives. Without it, all data disappears on every deploy.
4. Add these **variables**:

   | Variable | Value | Why |
   |---|---|---|
   | `ADMIN_PASSWORD` | from your password manager | Your admin login. |
   | `COOKIE_SECURE` | `true` | The site runs on HTTPS. |
   | `DATABASE_PATH` | `/data/luckdecidesyourfate.db` | Keeps the database on the volume. |
   | `GAME_TTL_DAYS` | `7` | Idle public wheels are deleted after this many days. |
   | `RAILWAY_RUN_UID` | `0` | Railway's volumes are owned by root, so the app must run as root on Railway to write to them. The image itself stays non-root everywhere else. |

   Do **not** set `SPIN_DURATION_*` or `PORT`. Railway provides `PORT`.
5. Deploy. Check the logs for a line starting with `config:` and no errors. It should look like `config: db=/data/luckdecidesyourfate.db cookie_secure=true ttl_days=7 frontend=yes backups=off`.
6. **Volume write check:** create a rigged link in the admin at `/admin`, then trigger a redeploy (Railway → Deployments → Redeploy). Log in again: **the link must still be there.**

   If you see permission errors, or the link is gone, the volume isn't writable or isn't mounted at `/data`. Stop and fix that before continuing:
   - Check that the volume's mount path is exactly `/data`.
   - Check that `RAILWAY_RUN_UID` is `0` and `DATABASE_PATH` starts with `/data/`.
7. Test on the Railway-provided URL (`*.up.railway.app`): the wheel, admin login, a rigged link, and spins.

## 3. Custom domain + Cloudflare DNS

1. In Railway → service → **Networking → Custom Domain**, add `luckdecidesyourfate.com`. Railway shows the DNS record to create (usually a CNAME target).
2. In Cloudflare → `luckdecidesyourfate.com` → **DNS**, create exactly the record Railway asked for. Cloudflare allows a CNAME on the root domain (CNAME flattening).
3. **Start with the record set to "DNS only" (grey cloud).** Wait until Railway shows the domain as verified with an active certificate.
4. Optional, later: switch to "Proxied" (orange cloud). If you do, set Cloudflare **SSL/TLS mode to "Full (strict)"** and test again. WebSockets work through the Cloudflare proxy. If anything breaks, switch back to DNS only.

## 4. Redirects (Cloudflare)

Goal: every other hostname sends a **301** to `https://luckdecidesyourfate.com` + the same path + query.

1. **`www.luckdecidesyourfate.com`:**
   - Add a DNS record `www` (proxied, orange cloud). The target can be a placeholder like `A 192.0.2.1`, because Cloudflare answers the redirect before reaching it.
   - Add a Redirect Rule: hostname equals `www.luckdecidesyourfate.com` → dynamic redirect to `concat("https://luckdecidesyourfate.com", http.request.uri.path)`, status 301, **preserve query string** on.
2. **`luckdecideyourfate.com` and `www.luckdecideyourfate.com`:** in that domain's Cloudflare zone:
   - Add proxied DNS records for `@` and `www` (same placeholder).
   - Add one Redirect Rule matching both hostnames, with the same dynamic target, 301, preserve query string.
3. SSL/TLS → Edge Certificates → turn on **Always Use HTTPS** for both zones.

## 5. Verify the live site

```bash
curl -s https://luckdecidesyourfate.com/api/health                      # {"status":"ok"}
curl -sI https://luckdecideyourfate.com/g/abc123?x=1 | grep -i ^location  # https://luckdecidesyourfate.com/g/abc123?x=1
curl -sI https://www.luckdecideyourfate.com/      | grep -i ^location
curl -sI https://www.luckdecidesyourfate.com/     | grep -i ^location
curl -sI http://luckdecidesyourfate.com/          | grep -i ^location  # https://…
curl -sI https://luckdecidesyourfate.com/ | grep -i strict-transport-security
```

Then do a real-world run, **on your phone using mobile data, not Wi-Fi**, with your laptop as the admin device:

- [ ] Create a rigged link.
- [ ] Open it on the phone.
- [ ] Watch it go Connected.
- [ ] Add names and spin.
- [ ] Change the mode live.
- [ ] Confirm the result follows the rule.

Don't run the smoke scripts against production. They expect short spin durations and would leave test data behind.

**Link previews:** after a deploy that changes the preview tags or image, paste a wheel link into iMessage, Snapchat and Messenger. Each should show the site name, description and image. If a preview is missing, check that `https://luckdecidesyourfate.com/og-image.png` opens, then check Cloudflare's bot settings (Security → Bots): bot blocking can stop preview crawlers from reading the page. Chat apps cache previews, so test with a new wheel link.

## 6. Backups & rollback

- **Backups:** Admin dashboard → "Download backup", for example before every deploy. Store the file somewhere safe. To check a file, run `sqlite3 file.db "PRAGMA integrity_check"`, which should print `ok`. For automatic copies, see below.
- **Rollback:** In Railway → Deployments, redeploy the previous successful deployment. Alternatively, revert the PR on GitHub, and auto-deploy picks it up.
- **Restore a backup** (rare), rehearsed locally:
  1. Stop the app.
  2. Check the backup file: `sqlite3 backup.db "PRAGMA integrity_check"` should print `ok`.
  3. Copy it over the database file, for example `cp backup.db data/luckdecidesyourfate.db`.
  4. Delete the leftover `luckdecidesyourfate.db-wal` and `luckdecidesyourfate.db-shm` files next to it, if there are any. They belong to the old database.
  5. Start the app and check that your links and wheels are there.

  **The production restore is untested.** It needs the same steps on the Railway volume at `/data`, with the app stopped, and that hasn't been tried. Try it on a spare service before you have to rely on it.

### Automatic backups

A daily copy of the SQLite file goes to a private S3-compatible bucket outside Railway. They're off until all four `BACKUP_S3_*` variables are set. Setting only some of them stops the app at startup.

**What's in a copy:** wheels, names, rules, link labels and spin history. Admin sessions, live state and `ADMIN_PASSWORD` aren't in it. **Copies contain the rigging rules, so the bucket must stay private and the token must stay limited to it.**

**Set it up with Cloudflare R2:**

1. Cloudflare dashboard → **R2 Object Storage → Create bucket**. Name it, for example, `ldyf-backups`. Leave public access off.
2. On the R2 page, go to **Manage R2 API Tokens → Create API token**. Choose **Object Read & Write**, and limit it to that bucket only.
3. Copy the **Access Key ID**, **Secret Access Key** and the **S3 endpoint** (`https://<account-id>.r2.cloudflarestorage.com`). The secret is only shown once.
4. In Railway → service → **Variables**, add the following. Saving them restarts the app.

   | Variable | Value |
   |---|---|
   | `BACKUP_S3_ENDPOINT` | the S3 endpoint from step 3, without the bucket name |
   | `BACKUP_S3_BUCKET` | the bucket name |
   | `BACKUP_S3_ACCESS_KEY_ID` | from step 3 |
   | `BACKUP_S3_SECRET_ACCESS_KEY` | from step 3 |

   Optional: `BACKUP_INTERVAL_HOURS` (default 24) and `BACKUP_KEEP` (default 14). If you change either, update the "How long it's kept" line on the privacy page so it stays true.

**Confirm the first backup:**

1. The startup log line ends with `backups=on`, and a line `backup: uploaded` follows shortly after.
2. A `backups/luckdecidesyourfate-….db` object appears in the bucket.
3. The admin dashboard shows "Last automatic backup" with the time.
4. Download that object and run `sqlite3 file.db "PRAGMA integrity_check"`. It should print `ok`.

**How it behaves:**

- The app checks hourly and backs up when the newest copy in the bucket is at least `BACKUP_INTERVAL_HOURS` old, so restarts don't skip or repeat a backup.
- Old copies are deleted only after a successful upload, keeping the newest `BACKUP_KEEP`. Only objects named exactly like a backup under `backups/` are ever deleted.
- A failure leaves the app running and is retried at the next hourly check. **The dashboard shows it in red, so look there now and then.** It shows only an error type; the logs say which step failed.

## 7. After it's live

- Tag the release: `git tag v1.1.0 && git push --tags`.
- From now on, merging to `main` = deploying.
