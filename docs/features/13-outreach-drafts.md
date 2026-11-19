# 13 · Outreach email drafts

**Size:** S · **Needs:** 12 (nice to have, not required) · **Cost:** free

## Why

OMAV's `outreach` package asks Gemini to write a personal first-contact email
using the developer's GitHub context, and recruiters can keep reusable templates.
**OMAV doesn't send the email; it only drafts it.** DevFit has nothing between
"this person fits" and contacting them.

For DevFit the email is internal: *"Hi Linnéa, we have a Next.js project starting
in March and your work on boo-energi-portal looks like a strong match…"*

## Plan

1. **`draftOutreach(dev, requirement, fitScore, tone, creds)`** in a new
   `src/lib/outreach.ts`:
   - Prompt input: the developer's name, matching languages and frameworks,
     relevant repo names, the repo requirement summary, and the **already
     computed** verdict and sub-scores.
   - The prompt says: *mention only facts given here; don't invent projects,
     dates or numbers; don't state scores to the recipient.*
   - Output JSON `{ subject, body }`, validated with Zod (03).
   - `tone`: `"friendly" | "formal"`.
2. **Route `POST /api/outreach`** (`requireUser()`), body
   `{ analysisId, developerId, tone }`. Load the analysis with
   `getUserAnalysis(userId, id)` so it's scoped to the user. Use
   `resolveCredentials(user)`, so self-service accounts use their own Gemini key.
3. **UI:** a "Draft message" button on each result card and on the developer
   page. It opens an editable text area with **Copy** and **Open in email**. The
   second is a `mailto:` link with `subject` and `body` URL-encoded; the PM's own
   email client sends it.
4. **Templates (optional):** an `outreachTemplates { userId, name, body }`
   collection. A chosen template goes into the prompt as a style example.
5. **Save drafts with the shortlist** (if 12 is built), so a PM can see who has
   been contacted.

## Why not send the email automatically

Sending services (SendGrid, Resend, Postmark, SES) charge above small free
quotas, need a verified domain and DNS records, and bring deliverability and
consent work with them. A `mailto:` link sends from the PM's own account at no
cost, and the PM reviews every message, which is the right default for
AI-written text.

## How it stays free

One Gemini call per draft on the free tier, and `mailto:` costs nothing.

## Done when

- A PM can generate, edit, copy and open a draft in their email client.
- Drafts never mention numbers or facts that weren't in the input.
- Self-service accounts use their own Gemini key.
