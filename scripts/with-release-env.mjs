import { spawn } from 'node:child_process'

const [command, ...args] = process.argv.slice(2)

if (command) {
  const child = spawn(command, args, {
    env: {
      ...process.env,
      GITHUB_TOKEN: process.env.GITHUB_TOKEN || process.env.GH_TOKEN,
      NODE_AUTH_TOKEN: process.env.NODE_AUTH_TOKEN || process.env.NPM_TOKEN,
    },
    shell: process.platform === 'win32',
    stdio: 'inherit',
  })

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal)

      return
    }

    process.exitCode = code ?? 1
  })
} else {
  process.stderr.write('Usage: node scripts/with-release-env.mjs <command> [...args]\n')

  process.exitCode = 1
}
