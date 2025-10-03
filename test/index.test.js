'use strict'
const test = require('brittle')
const Hyperdrive = require('hyperdrive')
const Corestore = require('corestore')
const tmp = require('test-tmp')
const PearShaker = require('../')

test('single entrypoint', async (t) => {
  const tmpdir = await tmp()
  const store = new Corestore(tmpdir)
  await store.ready()
  const drive = new Hyperdrive(store)
  await drive.ready()

  await drive.put('/index.js', 'const dep = require("./dep.js")')
  await drive.put('/dep.js', 'console.log()')

  const pearShaker = new PearShaker(drive, ['/index.js'])
  const { files, skips } = await pearShaker.run()

  t.ok(files.includes('/index.js'))
  t.ok(files.includes('/dep.js'))
  t.is(skips.length, 0)
})

test('multiple entrypoints', async (t) => {
  const tmpdir = await tmp()
  const store = new Corestore(tmpdir)
  await store.ready()
  const drive = new Hyperdrive(store)
  await drive.ready()

  await drive.put('/a.js', 'require("./b.js")')
  await drive.put('/b.js', 'require("./c.js")')
  await drive.put('/c.js', 'console.log("hello")')
  await drive.put('/d.js', 'console.log("unused")')

  const pearShaker = new PearShaker(drive, ['/a.js', '/d.js'])
  const { files, skips } = await pearShaker.run()

  t.ok(files.includes('/a.js'))
  t.ok(files.includes('/b.js'))
  t.ok(files.includes('/c.js'))
  t.ok(files.includes('/d.js'))
  t.is(skips.length, 0)
})

test('deep dependency chain', async (t) => {
  const tmpdir = await tmp()
  const store = new Corestore(tmpdir)
  await store.ready()
  const drive = new Hyperdrive(store)
  await drive.ready()

  await drive.put('/root.js', 'require("./level1.js")')
  await drive.put('/level1.js', 'require("./level2.js")')
  await drive.put('/level2.js', 'require("./level3.js")')
  await drive.put('/level3.js', 'console.log("end")')

  const pearShaker = new PearShaker(drive, ['/root.js'])
  const { files, skips } = await pearShaker.run()

  const expected = ['/root.js', '/level1.js', '/level2.js', '/level3.js']

  t.ok(files.length === expected.length)
  t.ok(files.every((e) => expected.includes(e)))
  t.is(skips.length, 0)
})

test('circular dependencies', async (t) => {
  const tmpdir = await tmp()
  const store = new Corestore(tmpdir)
  await store.ready()
  const drive = new Hyperdrive(store)
  await drive.ready()

  await drive.put('/a.js', 'require("./b.js")')
  await drive.put('/b.js', 'require("./a.js")')

  const pearShaker = new PearShaker(drive, ['/a.js'])
  const { files, skips } = await pearShaker.run()

  t.ok(files.includes('/a.js'))
  t.ok(files.includes('/b.js'))
  t.is(skips.length, 0)
})

test('entry with no dependencies', async (t) => {
  const tmpdir = await tmp()
  const store = new Corestore(tmpdir)
  await store.ready()
  const drive = new Hyperdrive(store)
  await drive.ready()

  await drive.put('/main.js', 'console.log("on my own")')

  const pearShaker = new PearShaker(drive, ['/main.js'])
  const { files, skips } = await pearShaker.run()

  t.ok(files.length === 1)
  t.ok(files[0] === '/main.js')
  t.is(skips.length, 0)
})

test.skip('missing dependency', async (t) => {
  const tmpdir = await tmp()
  const store = new Corestore(tmpdir)
  await store.ready()
  const drive = new Hyperdrive(store)
  await drive.ready()

  await drive.put('/index.js', 'require("./missing.js")')

  const pearShaker = new PearShaker(drive, ['/index.js'])
  const { files, skips } = await pearShaker.run()
  t.ok(files.includes('/index.js'))
  t.ok(skips.map((s) => s.specifier).includes('./missing.js'))
  t.is(skips.length, 1)
})

test('entrypoint does not exist', async (t) => {
  const tmpdir = await tmp()
  const store = new Corestore(tmpdir)
  await store.ready()
  const drive = new Hyperdrive(store)
  await drive.ready()

  const pearShaker = new PearShaker(drive, ['/nope.js'])
  await t.exception(async () => pearShaker.run())
})

test('returns deferred module', async (t) => {
  const tmpdir = await tmp()
  const store = new Corestore(tmpdir)
  await store.ready()
  const drive = new Hyperdrive(store)
  await drive.ready()

  await drive.put(
    '/index.js',
    'require("dep");require("dep-b");require("dep-c")'
  )

  const pearShaker = new PearShaker(drive, ['/index.js'])
  const { files, skips } = await pearShaker.run()

  t.ok(files.includes('/index.js'))
  t.ok(skips.map((s) => s.specifier).includes('dep'))
  t.ok(skips.map((s) => s.specifier).includes('dep-b'))
  t.ok(skips.map((s) => s.specifier).includes('dep-c'))
  t.ok(skips.every((s) => s.referrer.href === 'drive:///index.js'))
  t.ok(skips.every((s) => s.referrer.pathname === '/index.js'))
  t.is(skips.length, 3)
})

test('returns deferred module with two entrypoints', async (t) => {
  const tmpdir = await tmp()
  const store = new Corestore(tmpdir)
  await store.ready()
  const drive = new Hyperdrive(store)
  await drive.ready()

  await drive.put('/foo.js', 'require("dep")')
  await drive.put('/bar.js', 'require("dep")')

  const pearShaker = new PearShaker(drive, ['/foo.js', '/bar.js'])
  const { files, skips } = await pearShaker.run()

  t.ok(files.includes('/foo.js'))
  t.ok(files.includes('/bar.js'))
  t.is(files.length, 2)
  t.ok(skips.map((s) => s.specifier).includes('dep'))
  t.is(skips.length, 2)
  t.ok(skips.map((s) => s.referrer.href).includes('drive:///foo.js'))
  t.ok(skips.map((s) => s.referrer.href).includes('drive:///bar.js'))
})

test('returns multiple deferred modules with two entrypoints', async (t) => {
  const tmpdir = await tmp()
  const store = new Corestore(tmpdir)
  await store.ready()
  const drive = new Hyperdrive(store)
  await drive.ready()

  await drive.put('/foo.js', 'require("a")')
  await drive.put('/bar.js', 'require("b")')

  const pearShaker = new PearShaker(drive, ['/foo.js', '/bar.js'])
  const { files, skips } = await pearShaker.run()

  t.ok(files.includes('/foo.js'))
  t.ok(files.includes('/bar.js'))
  t.is(files.length, 2)
  t.ok(skips.map((s) => s.specifier).includes('a'))
  t.ok(skips.map((s) => s.specifier).includes('b'))
  t.is(skips.length, 2)
  t.ok(skips.map((s) => s.referrer.href).includes('drive:///foo.js'))
  t.ok(skips.map((s) => s.referrer.href).includes('drive:///bar.js'))
})

test('defers without opt', async (t) => {
  const tmpdir = await tmp()
  const store = new Corestore(tmpdir)
  await store.ready()
  const drive = new Hyperdrive(store)
  await drive.ready()

  await drive.put('/index.js', 'require("./foo.js"); require("./bar.js")')
  await drive.put('/foo.js', 'console.log()')

  const pearShaker = new PearShaker(drive, ['/index.js'])
  const { files, skips } = await pearShaker.run()

  t.ok(files.includes('/index.js'))
  t.ok(files.includes('/foo.js'))
  t.is(files.length, 2)
  t.ok(skips.map((s) => s.specifier).includes('./bar.js'))
  t.is(skips.length, 1)
  t.ok(skips.every((s) => s.referrer.href === 'drive:///index.js'))
  t.ok(skips.every((s) => s.referrer.pathname === '/index.js'))
})

test('defers with opt', async (t) => {
  const tmpdir = await tmp()
  const store = new Corestore(tmpdir)
  await store.ready()
  const drive = new Hyperdrive(store)
  await drive.ready()

  await drive.put(
    '/index.js',
    'require("./foo.js"); require("./baz.js"); require("./bar.js")'
  )
  await drive.put('/foo.js', 'console.log()')
  await drive.put('/baz.js', 'console.log()')

  const pearShaker = new PearShaker(drive, ['/index.js'])
  const { files, skips } = await pearShaker.run({ defer: ['./bar.js'] })

  t.ok(files.includes('/index.js'))
  t.ok(files.includes('/foo.js'))
  t.ok(files.includes('/baz.js'))
  t.is(skips.length, 0)
})
