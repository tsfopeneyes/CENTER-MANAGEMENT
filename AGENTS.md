# AGENTS & CODEX RULES

## Project Rules
1. **Framework:** React + Vite + TailwindCSS + Supabase.
2. **Local First:** Work and verify on local server (`http://localhost:5173`) using `npm run dev`.
3. **Deployment:** Only deploy to Firebase Hosting (`npx firebase-tools deploy --only hosting`) when explicitly instructed by the user.
4. **RPC Fallbacks:** Always provide direct Supabase table fallbacks whenever invoking database RPC functions.
5. **Preserve Database Data:** Never alter or wipe existing database schemas or raw logs.
