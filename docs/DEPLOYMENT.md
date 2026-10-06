# Putting StudyOS online, free

This is the free way to run StudyOS on the internet, and the exact steps for
the parts only you can do: creating accounts, pasting settings and pressing
Deploy. Everything in the repository is already prepared for it.

The whole setup takes about 40 minutes the first time. Afterwards, every push
to `main` deploys itself.

## What runs where, and why

| Part                | Service       | Free allowance                                   |
| ------------------- | ------------- | ------------------------------------------------ |
| The web app         | Vercel Hobby  | No sleeping, 100 GB of traffic a month           |
| Postgres            | Neon Free     | 1 project, 0.5 GB of data, sleeps when unused    |
| Uploaded files      | Cloudflare R2 | 10 GB stored, no charge for downloads            |
| The document worker | Render Free   | 512 MB of memory, 750 hours a month, sleeps idle |
| Email               | Resend Free   | 3,000 emails a month, 100 a day                  |

ADR-007 chose Railway for the app and the worker. Railway's free plan is now
$1 of credit a month, which runs out in a few days, so this uses **Vercel** for
the web app and **Render** for the worker instead. Neon and R2 are as ADR-007
decided. Nothing in the code is tied to any of them: the same Docker image runs
anywhere, and moving later is a copy of the files and a new `DATABASE_URL`.

Two things are worth knowing before you start:

- **R2 asks for a card** to switch object storage on, even on the free
  allowance. Nothing is charged under 10 GB. If you would rather not, use
  Backblaze B2 instead (10 GB free, also asks for a card) and set `S3_ENDPOINT`
  to its address with `S3_REGION` from its hostname.
- **The free worker has 512 MB of memory.** Reading a long scanned PDF with OCR
  peaks around 440 MB with the settings below, so it fits but not with much to
  spare. Everything else (PDFs with a text layer, Word, PowerPoint, images,
  short scans) is well inside it. If a long scan is ever killed half-way, the
  document shows as failed and Retry runs it again; Render's 1 GB plan ($7 a
  month) removes the risk.

## 1. Postgres on Neon

1. Sign up at https://neon.com with your GitHub account. No card.
2. **Create project**: name it `studyos`, Postgres 17, region **Europe
   (Frankfurt)** or whichever is nearest you.
3. On the project dashboard, open **Connect** and copy two strings:
   - the **pooled** one, which contains `-pooler`, for `DATABASE_URL`
   - the **direct** one (toggle "connection pooling" off), for
     `DATABASE_URL_UNPOOLED`, which is what migrations use
4. Keep both in a scratch file for the next steps. They contain the password.

Nothing else is needed: the extensions StudyOS uses (`pg_trgm`, `unaccent`) are
created by its migrations, which run on deploy.

## 2. Files on Cloudflare R2

1. Sign up at https://dash.cloudflare.com.
2. **R2 Object Storage** in the sidebar → **Purchase R2** (a card is asked for;
   the 10 GB allowance is free).
3. **Create bucket**: name `studyos-files`, location **Automatic** or EU,
   standard storage class. Leave public access off: StudyOS signs every read.
4. **Manage R2 API Tokens** → **Create API token**:
   - Permissions: **Object Read & Write**
   - Specify bucket: `studyos-files`
   - TTL: forever
5. Copy the **Access Key ID**, the **Secret Access Key** and the
   **endpoint** shown for your account, which looks like
   `https://<account-id>.r2.cloudflarestorage.com`.

The browser uploads files straight to the bucket, so the bucket has to allow
the app's address. Do that after step 4, when you know the address:

- In the bucket → **Settings** → **CORS policy** → **Edit**, paste this, with
  your own address:

  ```json
  [
    {
      "AllowedOrigins": ["https://studyos.vercel.app"],
      "AllowedMethods": ["GET", "HEAD", "PUT"],
      "AllowedHeaders": ["content-type"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3600
    }
  ]
  ```

- Or, from a checkout with the `S3_*` values in `.env`:
  `pnpm storage:cors https://studyos.vercel.app`

## 3. Email on Resend

Verification and password-reset emails need a sender.

1. Sign up at https://resend.com. No card.
2. **API Keys** → **Create API Key**, sending access, copy it.
3. Without a domain of your own, send from `onboarding@resend.dev`, which
   Resend allows to **your own address only**. That is enough for a private
   StudyOS. With a domain, add it under **Domains** and use an address there.

## 4. The web app on Vercel

1. Sign up at https://vercel.com with GitHub. No card.
2. **Add New** → **Project** → import `leolennards/StudyOS`.
3. Leave the framework and build settings alone: `vercel.json` in the
   repository sets them, and runs the database migrations during a production
   build, so a failed migration keeps the previous version live.
4. Before pressing Deploy, open **Environment Variables** and add, for
   Production:

   | Name                    | Value                                                        |
   | ----------------------- | ------------------------------------------------------------ |
   | `DATABASE_URL`          | the pooled Neon string                                       |
   | `DATABASE_URL_UNPOOLED` | the direct Neon string                                       |
   | `BETTER_AUTH_SECRET`    | `openssl rand -base64 32` in a terminal                      |
   | `BETTER_AUTH_URL`       | `https://studyos.vercel.app` (fix it after the first deploy) |
   | `RESEND_API_KEY`        | from step 3                                                  |
   | `EMAIL_FROM`            | `StudyOS <onboarding@resend.dev>`                            |
   | `STORAGE_DRIVER`        | `s3`                                                         |
   | `S3_ENDPOINT`           | your R2 endpoint                                             |
   | `S3_BUCKET`             | `studyos-files`                                              |
   | `S3_ACCESS_KEY_ID`      | from step 2                                                  |
   | `S3_SECRET_ACCESS_KEY`  | from step 2                                                  |
   | `SIGNUP_ALLOWED_EMAILS` | your email address, so nobody else can sign up               |
   | `CRON_SECRET`           | `openssl rand -hex 16`                                       |

5. **Deploy**. When it finishes, Vercel shows the address. If it is not
   `studyos.vercel.app`, go back to the variables, correct `BETTER_AUTH_URL`
   to the real address, and redeploy — sign-in depends on it being right.
6. Put that same address in the bucket's CORS policy (end of step 2).

Sign-up works at this point, and so do subjects, notes, flashcards and search.
Uploads will sit at "Waiting" until the worker exists.

## 5. The worker on Render

The worker is the second process that reads uploaded documents: it extracts
text, runs OCR on scans and converts Word and PowerPoint files for the viewer.
Render's free plan has no background worker type, so it runs as a web service
whose only page is `/health`, which is also how it is woken up.

1. Sign up at https://render.com with GitHub. No card.
2. **New** → **Blueprint** → pick `leolennards/StudyOS` → it reads
   `render.yaml` and offers one service, `studyos-worker`.
3. It asks for the values marked as "sync: false". Give it:
   - `DATABASE_URL`: the **pooled** Neon string
   - `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`:
     as on Vercel
   - `BETTER_AUTH_URL`: the app's address
4. **Apply**. The first build takes about ten minutes, because the image
   installs LibreOffice.
5. When it is live, copy the service's address, something like
   `https://studyos-worker.onrender.com`.
6. Add two more variables to the worker, under **Environment**:
   - `WORKER_PUBLIC_URL`: that address, so it keeps itself awake while it has
     work to do
   - `OCR_RENDER_WIDTH`: `1240`, which keeps OCR inside 512 MB of memory
7. Back on Vercel, add `WORKER_URL` with the same address and redeploy. That
   is how the app wakes the worker the moment a file is uploaded.

A free Render service stops after 15 minutes without a request, and takes about
a minute to start again. So the first upload after a quiet spell says "Waiting"
for a minute before it starts. That is the trade-off of the free plan, not a
fault.

## 6. Check it end to end

1. Open the app, sign up with the address you allowed, confirm the email.
2. Create a subject, then a topic.
3. Upload a PDF with text in it. It should turn Ready within a minute or two
   (longer if the worker is asleep), and its text should appear in the viewer
   and in ⌘K search.
4. Upload a Word file. Ready means LibreOffice converted it, so the original
   shows in the viewer.
5. Upload a scan or a photo of a page. Ready with "read with OCR" on the page
   means Tesseract ran in the worker.
6. Write a note, make a flashcard from a selection, review it at `/review`.
7. Visit `/api/health` — it should answer `{"status":"ok","database":"ok"}`.

If an upload stays at "Waiting" for more than five minutes, open the worker's
address in a browser. `{"status":"ok"}` means it is awake and the queue should
move; anything else means its logs on Render are the place to look.

## Afterwards

- **Deploys**: every push to `main` deploys the app on Vercel and, when
  anything under `src/` changes, the worker on Render.
- **Costs**: nothing, as long as files stay under 10 GB, the database under
  0.5 GB and the worker under 750 hours a month (it sleeps, so a day of study
  is a few hours).
- **Neon sleeps** after 5 minutes without a query; the first page load after
  that waits about a second for it.
- **Backups**: Neon's free plan keeps a day of history. A weekly
  `pg_dump` kept somewhere else is worth doing before this holds work you
  would miss.
- **Keeping others out**: `SIGNUP_ALLOWED_EMAILS` is the only thing stopping
  someone who finds the address from making an account. Add a friend's address
  to it to let them in.
