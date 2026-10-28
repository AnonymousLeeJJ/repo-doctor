# Repo Doctor

A browser-based GitHub repository health checker.

Enter a repository URL and get a 100-point report covering:

- README quality and quickstart clarity
- Visuals and demo links
- License and topics
- Recent activity and release history
- Security policy
- Contributing guide, issue templates, PR templates, and code of conduct
- Bilingual and share-ready metadata

## Website

https://anonymousleejj.github.io/repo-doctor/

## How It Works

1. Parse the repository URL
2. Read public repository metadata from the GitHub API
3. Inspect README content and repository files
4. Apply the open scoring model in `checks.json`
5. Generate a score, category breakdown, detailed checks, and fix list

## Scoring Model

| Category | Points |
| --- | ---: |
| Presentation | 35 |
| Trust and maintenance | 32 |
| Community collaboration | 23 |
| Reach and sharing | 10 |

The model is intentionally simple, transparent, and easy to improve through pull requests.

## Privacy

- No login required
- No user data collected
- Only public repositories can be checked
- The score measures project packaging quality, not code quality or security

## Roadmap

- More health checks
- Markdown report export
- History comparison
- GitHub Action support
- CLI version

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
