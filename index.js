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

const target = [
  'darwin-arm64',
  'darwin-x64',
  'linux-arm64',
  'linux-x64',
  'win32-x64',
  'win32-x64'
]

module.exports = class {
  constructor(drive, entrypoints) {
    this._drive = drive
    this._entrypoints = entrypoints
  }

  async run(opts = {}) {
    const entrypoints = this._entrypoints

    const defer = opts.defer || []

    return (
      await Promise.all(
        entrypoints.map(async (entrypoint) =>
          this._traverse(entrypoint, Array.from(defer))
        ) // pass copy of the original
      )
    ).reduce(
      (acc, { files, skips }) => {
        acc.files = Array.from(new Set(acc.files.concat(files)))
        acc.skips = Array.from(
          new Map(
            acc.skips
              .concat(skips)
              .map((s) => [s.specifier + s.referrer.href, s])
          ).values() // dedup skips by (specifier + referrer.href)
        )
        return acc
      },
      { files: [], skips: [] }
    )
  }

  async _traverse(entrypoint, defer) {
    const skips = []
    while (true) {
      try {
        const bundle = await pack(this._drive, entrypoint, {
          builtins,
          target,
          resolve,
          defer
        })
        return { files: Object.keys(bundle.files), skips }
      } catch (err) {
        if (err.code !== 'MODULE_NOT_FOUND') throw err
        if (err.referrer === null) throw err // means the entrypoint is missing, we cannot defer
        defer.push(err.specifier)
        skips.push({
          specifier: err.specifier,
          referrer: err.referrer,
          candidates: err.candidates
        })
      }
    }
  }
}

function resolve(entry, parentURL, opts = {}) {
  let extensions
  let conditions = opts.target.reduce((acc, host) => {
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
      hosts: opts.target,
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
