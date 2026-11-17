# Bar Trivia Now

A bilingual directory for finding pub trivia and other venue events in Ontario and Québec. Browse by radius, date, weekday, fee, prize and event language. The reviewed pilot catalog contains 120 trivia listings and three other events.

```sh
npm ci
npm run check:catalog
npm test
npm run build
npm run preview
```

Open http://127.0.0.1:8787/en/ for the local Worker preview. Node.js 24 is required.

- [Regional coverage and sources](docs/coverage.md)
- [Review, deployment and recovery](docs/operations.md)
- [Pilot catalog](src/data/catalog.json)

The preview serves the public catalog without database credentials. The optional private correction queue requires the Supabase migration and Worker secrets described in the operations guide.
