import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'

const extensionRequire = createRequire(new URL('../packages/vscode-dep-beacon/package.json', import.meta.url))
const publisherRequire = createRequire(extensionRequire.resolve('@vscode/vsce/package.json'))
const identityRequire = createRequire(publisherRequire.resolve('@azure/identity/package.json'))
const msalPath = identityRequire.resolve('@azure/msal-node/package.json')

const variants = [
  ['CommonJS', identityRequire('@azure/msal-node')],
  ['ES modules', await import(pathToFileURL(join(dirname(msalPath), 'dist/index.mjs')).href)],
]

const configuration = () => ({ auth: { clientId: 'fixture-client', clientSecret: 'fixture-secret' } })
const request = () => ({ scopes: ['https://graph.microsoft.com/.default'], code: 'trusted-code', nonce: 'trusted-nonce', redirectUri: 'https://app.example.test/callback' })

for (const [name, { ConfidentialClientApplication }] of variants) {
  test(`${name}: reject instance-aware confidential clients before network access`, async () => {
    assert.throws(() => new ConfidentialClientApplication({ auth: { ...configuration().auth, instanceAware: true } }), { errorCode: 'unsupported_cca_instance_aware' })

    const client = new ConfidentialClientApplication(configuration())

    for (const value of ['true', 'false', '']) {
      await assert.rejects(client.getAuthCodeUrl({ ...request(), extraQueryParameters: { ['instance_aware']: value } }), { errorCode: 'unsupported_cca_instance_aware' })
    }
  })

  test(`${name}: discard response routing metadata while preserving request code, nonce and response state`, async context => {
    const parent = Object.getPrototypeOf(ConfidentialClientApplication.prototype)
    const delegated = context.mock.method(parent, 'acquireTokenByCode', async () => null)
    const client = new ConfidentialClientApplication(configuration())
    const codeRequest = request()
    const payload = { code: 'untrusted-code', nonce: 'untrusted-nonce', state: 'returned-state', ['cloud_instance_host_name']: 'attacker.example.test', ['cloud_instance_name']: 'untrusted', ['cloud_graph_host_name']: 'attacker.example.test', ['msgraph_host']: 'attacker.example.test', ['client_info']: 'untrusted' }

    await client.acquireTokenByCode(codeRequest, payload)

    assert.deepEqual(delegated.mock.calls[0].arguments, [codeRequest, { code: 'trusted-code', state: 'returned-state', nonce: 'trusted-nonce' }])

    await client.acquireTokenByCode({ ...codeRequest, nonce: undefined }, payload)

    assert.equal(delegated.mock.calls[1].arguments[1].nonce, undefined)

    await client.acquireTokenByCode(codeRequest)

    assert.deepEqual(delegated.mock.calls[2].arguments, [codeRequest, undefined])
  })

  test(`${name}: send authorization codes only to the configured token endpoint`, async () => {
    const requests = []

    const metadata = {
      ['authorization_endpoint']: 'https://login.example.test/tenant/authorize',
      ['token_endpoint']: 'https://login.example.test/tenant/token',
      issuer: 'https://login.example.test/tenant',
      ['jwks_uri']: 'https://login.example.test/tenant/keys',
      ['end_session_endpoint']: 'https://login.example.test/tenant/logout',
    }

    const client = new ConfidentialClientApplication({
      auth: { ...configuration().auth, authority: 'https://login.example.test/tenant', knownAuthorities: ['login.example.test'], authorityMetadata: JSON.stringify(metadata) },
      system: { networkClient: {
        sendGetRequestAsync: async url => { throw new Error(`Unexpected discovery request: ${url}`) },
        sendPostRequestAsync: async (url, options) => { requests.push({ url, body: options.body });

 throw new Error('Fixture stops before issuing a token') },
      } },
    })

    await assert.rejects(client.acquireTokenByCode(request(), { code: 'untrusted-code', ['cloud_instance_host_name']: 'attacker.example.test' }))

    assert.equal(requests.length, 1)

    assert.equal(new URL(requests[0].url).origin, 'https://login.example.test')

    assert.equal(new URL(requests[0].url).pathname, '/tenant/token')

    assert.equal(new URLSearchParams(requests[0].body).get('code'), 'trusted-code')
  })

  test(`${name}: retain state mismatch protection`, async () => {
    const client = new ConfidentialClientApplication(configuration())

    await assert.rejects(client.acquireTokenByCode({ ...request(), state: 'expected-state' }, { code: 'untrusted-code', state: 'wrong-state' }), { errorCode: 'state_mismatch' })
  })

  test(`${name}: retain normal authorization URL delegation`, async context => {
    const parent = Object.getPrototypeOf(ConfidentialClientApplication.prototype)
    const delegated = context.mock.method(parent, 'getAuthCodeUrl', async () => 'https://login.example.test/authorize')
    const client = new ConfidentialClientApplication(configuration())
    const authorizationRequest = request()

    assert.equal(await client.getAuthCodeUrl(authorizationRequest), 'https://login.example.test/authorize')

    assert.deepEqual(delegated.mock.calls[0].arguments, [authorizationRequest])
  })
}
