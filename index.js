'use strict'
const pack = require('bare-pack-drive')
const traverse = require('bare-module-traverse')
const lex = require('bare-module-lexer')

const builtins = [
  'net',
  'assert',
  'console',
  'events',
  'fs',
  'fs/promises',
  'http',
  'https',
  'os',
  'util',
  'path',
  'child_process',
  'repl',
  'url',
  'tty',
  'module',
  'process',
  'timers',
  'inspector',
  'electron',
  'stream',
  'crypto',
  'tls',
  'zlib',
  'buffer'
]

const hosts = ['darwin-arm64', 'darwin-x64', 'linux-arm64', 'linux-x64', 'win32-x64', 'win32-x64']

module.exports = class {
  constructor(drive, entrypoints) {
    this._drive = drive
    this._entrypoints = [...new Set(entrypoints)]
  }

  async run(opts = {}) {
    const entrypoints = this._entrypoints

    const defer = opts.defer || []
    const files = new Set()
    const skips = []
    const resolutions = []

    await Promise.all(
      entrypoints.map(
        async (entrypoint) =>
          await this._traverse(entrypoint, Array.from(defer), files, skips, resolutions)
      ) // only pass defer by value, files and skips must be passed by reference
    )
    const spreadResolutions = resolutions.reduce((acc, r) => {
      return { ...acc, ...r }
    }, {})
    return { files: [...files], skips, resolutions: spreadResolutions }
  }

  async _traverse(entrypoint, defer, files, skips, resolutions) {
    try {
      const bundle = await pack(this._drive, entrypoint, {
        builtins,
        hosts,
        resolve,
        defer
      })
      for (const file of Object.keys(bundle.files)) files.add(file)
      resolutions.push(bundle.resolutions)
    } catch (err) {
      if (err.code !== 'MODULE_NOT_FOUND') throw err
      if (err.referrer === null) throw err // means the entrypoint is missing, we cannot defer
      defer.push(err.specifier)
      skips.push({
        specifier: err.specifier,
        referrer: err.referrer,
        candidates: err.candidates
      })
      await this._traverse(entrypoint, defer, files, skips, resolutions)
    }
  }
}

function resolve(entry, parentURL, opts = {}) {
  let extensions
  let conditions = (opts.hosts || hosts).reduce((acc, host) => {
    acc.push(['node', ...host.split('-')])
    acc.push(['node', 'bare', ...host.split('-')])
    acc.push(['module', ...host.split('-')])
    return acc
  }, [])

  if (entry.type & lex.constants.ADDON) {
    extensions = ['.node', '.bare']
    conditions = conditions.map((conditions) => ['addon', ...conditions])

    return traverse.resolve.addon(entry.specifier || '.', parentURL, {
      extensions,
      conditions,
      hosts: opts.hosts || hosts,
      linked: false,
      ...opts
    })
  }

  if (entry.type & lex.constants.ASSET) {
    conditions = conditions.map((conditions) => ['asset', ...conditions])
  } else {
    extensions = ['.js', '.cjs', '.mjs', '.json', '.node', '.bare']

    if (entry.type & lex.constants.REQUIRE) {
      conditions = conditions.map((conditions) => ['require', ...conditions])
    } else if (entry.type & lex.constants.IMPORT) {
      conditions = conditions.map((conditions) => ['import', ...conditions])
    }
  }

  return traverse.resolve.module(entry.specifier, parentURL, {
    extensions,
    conditions,
    ...opts
  })
}
