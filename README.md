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

## Uploads and keys

Objects are stored under `<basePrefix>/<document-path>/<document-name>/<file-name>`,
e.g. uploading `hero.png` into `content/blog/my-post.mdx` lands in
`assets/content/blog/my-post/hero.png`. Path segments are sanitized
(lowercase, `[a-z0-9._-]` only).

If the target key already exists — or uniqueness cannot be verified on the
store — the file is uploaded under a `-<suffix>` variant instead of
overwriting. Uploading a new version of the same file therefore creates a new
object; a notification lists every upload that got a fallback name. Delete
the old one from the `MDX Assets` view when it is no longer used.

## Profile resolution

Uploads pick a profile in this order:

1. Session override (`Mdx Assets: Switch Active Profile (Session)`)
2. Workspace default (`mdxAssetManager.workspaceDefaultProfile`)
3. User default (`mdxAssetManager.defaultProfile`)
4. The only configured profile, if exactly one exists
5. Interactive pick (uploads prompted from the editor only)

The `MDX Assets` sidebar listing uses the same resolution non-interactively.

## Credentials and security

Access keys are stored in VS Code `SecretStorage` per profile — never in
settings, so they are not committed with `.vscode/settings.json`. Settings
hold only non-secret profile data (bucket, endpoint, base URL).

Generated snippets escape filenames and URLs for their output context, so
oddly named files cannot break out of the emitted markup. Things to know:

- `.svg` uploads are allowed by default; if `publicBaseUrl` shares an origin
  with your app, served SVGs are a script-execution vector — consider
  removing `.svg` from `mdxAssetManager.allowedExtensions` or serving assets
  from a dedicated origin.
- `Mdx Assets: Add Endpoint Profile` can run a connection check that writes
  and deletes a small `__mdx_asset_manager_probe__/` object in the bucket.
  Set `mdxAssetManager.connectionCheck` to `read-only` to make the check
  list-only (it then cannot verify upload permission).

## Profile and settings scope

- `Mdx Assets: Add/Edit/Remove Endpoint Profile` write
  `mdxAssetManager.profiles` and `mdxAssetManager.defaultProfile` to **user
  settings**.
- `mdxAssetManager.workspaceDefaultProfile` is written to **workspace
  settings** (`.vscode/settings.json`).
- Settings merge (workspace values win), so a team can commit non-secret
  profiles — bucket, endpoint, `publicBaseUrl`, `basePrefix` — in
  `.vscode/settings.json` to share endpoint configuration through the repo.
- Credentials are never in settings: they live in VS Code `SecretStorage`,
  keyed by profile id and scoped to the machine/user. Each person runs
  `Mdx Assets: Set Profile Credentials` once per profile.

## Troubleshooting

- **Upload fails with 403**: the key needs `s3:PutObject` (and ideally
  `s3:GetObject`/`s3:ListBucket`/`s3:DeleteObject` for the sidebar). Missing
  `ListBucket` is tolerated: uploads fall back to suffixed keys.
- **Files are skipped with "extension ... is not allowed"**: extend
  `mdxAssetManager.allowedExtensions`.
- **A "Failed to upload N file(s)" notification appears**: each file is
  isolated; the notification lists the per-file reasons and successful
  snippets are still inserted.
- **Sidebar shows "Open an MDX/Markdown/HTML file"**: listing is scoped to
  the active document.

## Settings

- `mdxAssetManager.profiles`: endpoint profiles
- `mdxAssetManager.defaultProfile`: global default profile id
- `mdxAssetManager.workspaceDefaultProfile`: workspace default profile id
- `mdxAssetManager.allowedExtensions`: allowed upload extensions
- `mdxAssetManager.maxUploadSizeMB`: maximum file size
- `mdxAssetManager.connectionCheck`: credential validation mode (`write-probe`, default, or `read-only`)
- `mdxAssetManager.promptForWorkspaceDefault`: ask to set a workspace default after an interactive profile pick (default on)
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
