// Stand-in for Member 2's backend so the worker app can be built and demoed on its own.
// Implements the frozen contract: /auth/login, /children/search, /children, /scans, /sync.
// No dependencies. Run:  npm run mock        (defaults to port 8000)
//
//   MOCK_FAIL=1  npm run mock   -> ~25% of scans answer 422 reference_object_not_detected
//   MOCK_DELAY=3000 npm run mock -> slower "CV service" (ms)

import http from 'node:http'
import { randomUUID } from 'node:crypto'

const PORT = Number(process.env.PORT ?? 8000)
const FAIL = process.env.MOCK_FAIL === '1'
const DELAY = Number(process.env.MOCK_DELAY ?? 1200)

const USERS = [
  { phone: '9876543210', password: 'worker123', role: 'worker', user_id: 'b7c1f0a2-0000-4000-8000-000000000001' },
  { phone: '9000000000', password: 'super123', role: 'supervisor', user_id: 'b7c1f0a2-0000-4000-8000-000000000002' },
]

const yearsAgo = (y, m = 0) => {
  const d = new Date()
  d.setMonth(d.getMonth() - (y * 12 + m))
  return d.toISOString().slice(0, 10)
}

const children = [
  { name: 'Aarav Kumar', dob: yearsAgo(2, 3), gender: 'M', guardian_name: 'Sunita Kumar', village: 'Rampur' },
  { name: 'Diya Sharma', dob: yearsAgo(1, 8), gender: 'F', guardian_name: 'Meena Sharma', village: 'Rampur' },
  { name: 'Kabir Singh', dob: yearsAgo(3, 1), gender: 'M', guardian_name: 'Poonam Singh', village: 'Khedi' },
  { name: 'Ananya Yadav', dob: yearsAgo(0, 9), gender: 'F', guardian_name: 'Rekha Yadav', village: 'Khedi' },
  { name: 'Vihaan Gupta', dob: yearsAgo(4, 6), gender: 'M', guardian_name: 'Anita Gupta', village: 'Rampur' },
  { name: 'Ishita Verma', dob: yearsAgo(0, 3), gender: 'F', guardian_name: 'Kavita Verma', village: 'Sonpur' },
].map((c) => ({ child_id: randomUUID(), ...c }))

const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const fakeJwt = (u) =>
  `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: u.user_id, role: u.role, exp: Math.floor(Date.now() / 1000) + 8 * 3600 })}.mock`

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
}

function send(res, status, body) {
  cors(res)
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

async function readBody(req) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  return Buffer.concat(chunks)
}

/** Pulls a plain text field out of a multipart body without a parser (fine for a mock). */
function field(raw, name) {
  const m = raw.match(new RegExp(`name="${name}"\\r\\n\\r\\n([\\s\\S]*?)\\r\\n--`))
  return m ? m[1] : undefined
}

function fakeScan({ child_id, client_scan_id }) {
  const muac = Math.round((104 + Math.random() * 32) * 10) / 10
  return {
    scan_id: randomUUID(),
    client_scan_id,
    child_id,
    muac_estimate_mm: muac,
    risk_band: muac < 115 ? 'SAM' : muac < 125 ? 'MAM' : 'NORMAL',
    confidence_score: Math.round((0.45 + Math.random() * 0.5) * 100) / 100,
    created_at: new Date().toISOString(),
  }
}

const REF_ERROR = {
  error: 'reference_object_not_detected',
  message: 'Could not detect reference marker in image.',
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  if (req.method === 'OPTIONS') {
    cors(res)
    res.writeHead(204)
    return res.end()
  }

  try {
    if (req.method === 'POST' && url.pathname === '/auth/login') {
      const { phone, password } = JSON.parse((await readBody(req)).toString() || '{}')
      const user = USERS.find((u) => u.phone === phone && u.password === password)
      if (!user) return send(res, 401, { detail: 'Incorrect phone number or password.' })
      return send(res, 200, { access_token: fakeJwt(user), role: user.role, user_id: user.user_id })
    }

    if (!(req.headers.authorization ?? '').startsWith('Bearer ')) {
      return send(res, 401, { detail: 'Not authenticated' })
    }

    if (req.method === 'GET' && url.pathname === '/children/search') {
      const q = (url.searchParams.get('q') ?? '').toLowerCase()
      const hits = children.filter((c) =>
        [c.name, c.guardian_name, c.village, c.child_id].some((f) => f?.toLowerCase().includes(q)),
      )
      return send(res, 200, hits.slice(0, 20))
    }

    if (req.method === 'POST' && url.pathname === '/children') {
      const input = JSON.parse((await readBody(req)).toString() || '{}')
      if (!input.name || !input.dob) return send(res, 422, { detail: [{ msg: 'name and dob are required' }] })
      const child = { child_id: randomUUID(), ...input }
      children.push(child)
      return send(res, 201, child)
    }

    if (req.method === 'POST' && url.pathname === '/scans') {
      const raw = (await readBody(req)).toString('latin1')
      await sleep(DELAY)
      if (FAIL && Math.random() < 0.25) return send(res, 422, REF_ERROR)
      return send(res, 200, fakeScan({ child_id: field(raw, 'child_id'), client_scan_id: field(raw, 'client_scan_id') }))
    }

    if (req.method === 'POST' && url.pathname === '/sync') {
      const raw = (await readBody(req)).toString('utf8')
      const meta = JSON.parse(field(raw, 'metadata') ?? '[]')
      await sleep(DELAY)
      const results = meta.map((m) =>
        FAIL && Math.random() < 0.25 ? { ...REF_ERROR, client_scan_id: m.client_scan_id } : fakeScan(m),
      )
      return send(res, 200, results)
    }

    return send(res, 404, { detail: 'Not found' })
  } catch (err) {
    console.error(err)
    return send(res, 500, { detail: 'Mock server error' })
  }
})

server.listen(PORT, () => {
  console.log(`PoshanScan mock API on http://localhost:${PORT}`)
  console.log('  worker login:     9876543210 / worker123')
  console.log('  supervisor login: 9000000000 / super123  (the worker app rejects this one)')
  if (FAIL) console.log('  MOCK_FAIL=1: ~25% of scans will be rejected with a 422')
})
