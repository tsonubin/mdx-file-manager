# MDX Asset Manager

VS Code extension for Markdown/MDX/HTML media workflows:

- Drag and drop local files into editor to upload and auto-insert links/snippets.
- Upload to S3-compatible endpoints (AWS S3, Cloudflare R2, custom S3).
- Configure multiple endpoint profiles with workspace/global default selection.
- Manage scoped assets in Activity Bar (`MDX Assets`) based on the active file path.

## Features

- Profile-based endpoint config (`aws-s3`, `cloudflare-r2`, `custom-s3`)
- Per-profile credentials in VS Code SecretStorage
- Workspace default profile + global default fallback
- Auto key generation from MDX file path
- Auto-unique conflict handling
- Context-aware insert for Markdown/MDX/HTML
- Custom insertion rules with token templates
- Asset explorer actions: copy URL, copy snippet, delete

## Settings

- `mdxAssetManager.profiles`: endpoint profiles
- `mdxAssetManager.defaultProfile`: global default profile id
- `mdxAssetManager.workspaceDefaultProfile`: workspace default profile id
- `mdxAssetManager.allowedExtensions`: allowed upload extensions
- `mdxAssetManager.maxUploadSizeMB`: maximum file size
- `mdxAssetManager.insertRules`: custom insertion templates

### Profile shape

```json
{
  "id": "prod-r2",
  "name": "Prod R2",
  "provider": "cloudflare-r2",
  "bucket": "my-assets",
  "accountId": "<cloudflare-account-id>",
  "publicBaseUrl": "https://cdn.example.com",
  "basePrefix": "assets"
}
```

## Commands

- `Mdx Assets: Add Endpoint Profile`
- `Mdx Assets: Edit Endpoint Profile`
- `Mdx Assets: Remove Endpoint Profile`
- `Mdx Assets: Set Workspace Default Profile`
- `Mdx Assets: Switch Active Profile (Session)`
- `Mdx Assets: Set Profile Credentials`
- `Mdx Assets: Clear Profile Credentials`
- `Mdx Assets: Upload From File Picker`
- `Mdx Assets: Refresh Assets`
- `Mdx Assets: Copy Asset URL`
- `Mdx Assets: Copy Asset Snippet`
- `Mdx Assets: Delete Asset`

## Custom insert rules

Templates can use:

- `${url}`
- `${filename}`
- `${basename}`
- `${ext}`
- `${mime}`
- `${key}`
- `${alt}`

Example rule:

```json
{
  "when": {
    "languageIds": ["mdx"],
    "mimePrefixes": ["video/"]
  },
  "template": "<video controls src=\"${url}\"></video>"
}
```

## Dev

```bash
npm install
npm run build
npm run test
npm run test:integration
```

Press `F5` in VS Code to launch the Extension Development Host. The
`.vscode/launch.json`/`tasks.json` in this repo wire the `npm: watch` compile
task automatically, so no extra setup is needed.

`test:integration` runs extension-host tests using `@vscode/test-electron` and downloads a VS Code test binary on first run. On headless Linux it needs a display (e.g. `xvfb-run -a npm run test:integration`).
