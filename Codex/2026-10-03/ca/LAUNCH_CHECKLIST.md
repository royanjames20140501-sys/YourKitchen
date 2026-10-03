# YourKitchen launch checklist

## Put the current app online

1. Create a private GitHub repository and add this project folder.
2. In Vercel, import that repository. Keep the project root as `.` and use the static/Other framework preset; no build command is needed. Vercel detects the two server functions in `api/`.
3. Add `OPENAI_API_KEY` as a Vercel environment variable, then deploy. Keep the key out of browser files.
4. Test the preview URL over HTTPS on a desktop browser and on iOS and Android before assigning a public domain.

Opening `index.html` directly as a `file://` page is useful for trying the offline recipe finder, but it does not run the server functions or install the service worker.

## Complete before inviting the public

- **Account sign-up and sync:** the You card is a placeholder. Choose an authentication provider and configure its project before collecting account details. Favourites, searches, and preferences are currently stored on each device.
- **API abuse and cost controls:** the AI endpoints currently use best-effort, in-memory per-instance request limits. Add a persistent shared rate limiter and set usage limits/alerts in the OpenAI project before broad access.
- **Recipe and image review:** the 31 bundled recipes have complete local data and working image paths, but have not been kitchen-tested as a set. Verify quantities, timings, allergen notes, and image usage rights before describing them as tested or using them commercially.
- **Feedback delivery:** feedback notes stay in the visitor’s browser. Connect a feedback inbox or form service before inviting people to send feedback.
- **Privacy:** keep `privacy.html` accurate as providers are added. AI prompts and recipe context are sent to the server and OpenAI; saved recipes and recent searches are not currently synced.
- **Preview QA:** confirm recipe search, recipe details, saved items, navigation, language switching, offline startup, and AI error states in a deployed preview.

The deployed preview is not published or configured from this folder; it requires access to your GitHub and Vercel accounts.
