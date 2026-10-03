# Connect the YourKitchen AI helper

The built-in recipe pages and offline cooking helper work from the local files. Live cooking answers and web-searched recipe ideas need the site hosted with its server functions enabled. Recipe ideas use OpenAI's Responses API web search and show source links in the page.

1. Deploy this folder as a Vercel project. The `api/` files run as server functions.
2. In the Vercel project settings, add an environment variable named `OPENAI_API_KEY` with your OpenAI API key as its value.
3. Redeploy the project so the AI functions receive the new variable.
4. Open the deployed HTTPS site and ask a question in a recipe’s “Questions about this dish?” section, or request ideas from the AI tab.

## Connect dish feedback and community recipe sharing

These features store data in an Upstash Redis database. Create a Redis database in Upstash, then add these environment variables to the Vercel project:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Use the HTTPS REST URL and its matching REST token from the Upstash database details. Redeploy after adding them. The same database holds feedback, up to 500 recent community recipes, up to 100 ratings per recipe, and up to 1,000 private reports. Feedback and ratings/reports are capped at 10 submissions per minute per visitor; recipe sharing is capped at 5 per hour. The rate-limit key contains a short-lived hash of the visitor IP; the saved feedback, ratings, reports, and recipe entries do not contain IP addresses.

Without those values, feedback stays queued on the visitor’s device and the community form can save a local preview, but community recipes are not shared between people. The feedback and community API endpoints are ready; they do not connect to storage until these secrets are set.

Ratings are displayed as a community average. Reports are kept privately in the Redis list `yk:community:reports` for the site owner to review in the Upstash console; there is not yet an in-app moderation dashboard.

The endpoint has a small per-instance request limit for a hobby project. Before sharing the site publicly, add persistent rate limiting and usage limits for the OpenAI API project.

Keep the key in Vercel’s server-side environment variables. Do not add it to `index.html`, `script.js`, or any file downloaded by the browser. OpenAI recommends environment variables or a secret manager for API keys: https://developers.openai.com/api/docs/guides/production-best-practices

If the site is opened directly as a `file://` page, AI web search is unavailable; built-in recipes still work offline, and recipe questions use the local helper. The bundled recipes are not a 10,000-item offline catalog; use the AI tab to search the web for additional ideas.

## Turn on user accounts and cross-device kitchen sync

The sign-in form is wired to Supabase Auth and the `user_kitchens` table. It syncs a signed-in person’s saved recipes, searches, recipe history, Food Lab ideas, taste profile, chat history, meal plan, shopping list, and game score. Each signed-in person gets one private JSON record protected by row-level security.

1. Create a Supabase project. In **Project Settings → API**, copy its **Project URL** and **Publishable key**.
2. In **Authentication → URL Configuration**, set the production site as the Site URL and add the exact YourKitchen page to the allowed Redirect URLs. Add your local development URL too if you use one. Supabase uses these URLs for email confirmation links; see the [redirect URL guide](https://supabase.com/docs/guides/auth/redirect-urls).
3. In the Supabase SQL Editor, run [`supabase/migrations/001_user_kitchens.sql`](supabase/migrations/001_user_kitchens.sql). It grants signed-in users access only to their own row, and no access to signed-out visitors. Keep row-level security enabled.
4. Put the Project URL and Publishable key in [`supabase-config.js`](supabase-config.js). Those two values are intended for the browser. Never place the Supabase `service_role` key there or in any browser file.
5. Deploy YourKitchen over HTTPS. Create an account, follow the confirmation email, then sign in. Existing device-local data is combined with the account’s cloud data on first sign-in.

Email/password sign-in is supported. Supabase email confirmation is enabled by default on hosted projects; its default email sender is for trying the flow, so configure custom SMTP before inviting the public. The [password sign-in guide](https://supabase.com/docs/guides/auth/passwords) covers those settings.

If the Supabase values are blank, the rest of the app continues to work and personal data remains on the current device. The sign-in form explains what is missing rather than pretending to create an account.
