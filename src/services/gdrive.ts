// src/services/gdrive.ts
//
// GIS popup-based OAuth + Google Drive v3 REST client.
// - OAuth uses Google Identity Services (GIS) token client for SPA.
// - If ad-blockers block the GIS iframe, users can manually allow
//   accounts.google.com or switch to redirect-based flow.

const SCOPES = 'https://www.googleapis.com/auth/drive.file'

// Loaded from .env — never committed
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID

let tokenClient: google.accounts.oauth2.TokenClient | null = null
let accessToken: string | null = null
let tokenExpiry = 0

/** Load GIS script and initialize the token client (no popup yet). */
export function initGis(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (tokenClient) {
      resolve()
      return
    }

    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.onload = () => {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        // callback is set lazily on each login() call
        callback: () => {},
      })
      resolve()
    }
    script.onerror = () => reject(new Error('Failed to load Google Identity Services script. Check if an ad-blocker is blocking accounts.google.com.'))
    document.head.appendChild(script)
  })
}

/** Show the OAuth popup and return an access token. Reuses cached token if valid. */
export async function login(): Promise<string> {
  if (!tokenClient) await initGis()

  // Reuse cached token
  if (accessToken && Date.now() < tokenExpiry) {
    return accessToken
  }

  return new Promise((resolve, reject) => {
    // Re-init with a fresh callback for this login attempt
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: (resp) => {
        if (resp.error) {
          reject(new Error(resp.error))
          return
        }
        accessToken = resp.access_token
        tokenExpiry = Date.now() + (parseInt(resp.expires_in) - 60) * 1000
        resolve(accessToken)
      },
    })
    tokenClient.requestAccessToken()
  })
}

/** Revoke the access token. */
export function logout(): void {
  if (accessToken) {
    google.accounts.oauth2.revoke(accessToken)
    accessToken = null
    tokenExpiry = 0
  }
}

/** Check if we have a valid (non-expired) access token. */
export function isLoggedIn(): boolean {
  return !!accessToken && Date.now() < tokenExpiry
}

// ── Drive API helpers ──

const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files'
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'

async function authHeaders(): Promise<Record<string, string>> {
  if (!isLoggedIn()) await login()
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }
}

/** Find or create the LazyMD folder in Drive root. */
export async function getAppFolderId(): Promise<string> {
  const headers = await authHeaders()

  // Search for existing folder
  const query = encodeURIComponent(
    "name='LazyMD' and mimeType='application/vnd.google-apps.folder' and trashed=false"
  )
  const res = await fetch(
    `${DRIVE_FILES}?q=${query}&spaces=drive&fields=files(id)&pageSize=1`,
    { headers }
  )
  const data = await res.json()
  if (data.files?.length > 0) return data.files[0].id

  // Create it
  const createRes = await fetch(DRIVE_FILES, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: 'LazyMD',
      mimeType: 'application/vnd.google-apps.folder',
    }),
  })
  const created = await createRes.json()
  return created.id
}

/** Upload a new .md file or update an existing one. */
export async function uploadNote(
  fileId: string | null,
  folderId: string,
  title: string,
  content: string
): Promise<{ id: string; modifiedTime: string }> {
  const metadata: Record<string, unknown> = {
    name: `${title}.md`,
    mimeType: 'text/markdown',
  }
  if (!fileId) {
    metadata.parents = [folderId]
  }

  // Multipart upload: metadata + content
  const boundary = 'lazymd_boundary_' + crypto.randomUUID().slice(0, 8)
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: text/markdown\r\n\r\n` +
    `${content}\r\n` +
    `--${boundary}--`

  const url = fileId
    ? `${DRIVE_UPLOAD}/${fileId}?uploadType=multipart`
    : `${DRIVE_UPLOAD}?uploadType=multipart`

  const res = await fetch(url, {
    method: fileId ? 'PATCH' : 'POST',
    headers: {
      ...(await authHeaders()),
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Drive upload failed (${res.status}): ${err}`)
  }

  return await res.json()
}

/** Download the content of a .md file. */
export async function downloadNote(fileId: string): Promise<string> {
  const res = await fetch(`${DRIVE_FILES}/${fileId}?alt=media`, {
    headers: await authHeaders(),
  })
  if (!res.ok) {
    throw new Error(`Drive download failed (${res.status})`)
  }
  return await res.text()
}

/** List all .md files in the LazyMD folder. */
export async function listRemoteNotes(
  folderId: string
): Promise<Array<{ id: string; name: string; modifiedTime: string }>> {
  const query = encodeURIComponent(
    `'${folderId}' in parents and mimeType='text/markdown' and trashed=false`
  )
  const res = await fetch(
    `${DRIVE_FILES}?q=${query}&fields=files(id,name,modifiedTime)&spaces=drive&pageSize=100`,
    { headers: await authHeaders() }
  )
  const data = await res.json()
  return data.files ?? []
}

/** Trash a file on Drive. */
export async function deleteRemoteFile(fileId: string): Promise<void> {
  const res = await fetch(`${DRIVE_FILES}/${fileId}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  })
  if (!res.ok && res.status !== 204) {
    throw new Error(`Drive delete failed (${res.status})`)
  }
}
