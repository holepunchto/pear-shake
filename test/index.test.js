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
  const files = await pearShaker.run()

  t.ok(files.includes('/index.js'))
  t.ok(files.includes('/dep.js'))
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
  const files = await pearShaker.run()

  t.ok(files.includes('/a.js'))
  t.ok(files.includes('/b.js'))
  t.ok(files.includes('/c.js'))
  t.ok(files.includes('/d.js'))
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
  const files = await pearShaker.run()

  const expected = ['/root.js', '/level1.js', '/level2.js', '/level3.js']

  t.ok(files.length === expected.length)
  t.ok(files.every((e) => expected.includes(e)))
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
  const files = await pearShaker.run()

  t.ok(files.includes('/a.js'))
  t.ok(files.includes('/b.js'))
})

test('entry with no dependencies', async (t) => {
  const tmpdir = await tmp()
  const store = new Corestore(tmpdir)
  await store.ready()
  const drive = new Hyperdrive(store)
  await drive.ready()

  await drive.put('/main.js', 'console.log("on my own")')

  const pearShaker = new PearShaker(drive, ['/main.js'])
  const files = await pearShaker.run()

  t.ok(files.length === 1)
  t.ok(files[0] === '/main.js')
})

test('missing dependency', async (t) => {
  const tmpdir = await tmp()
  const store = new Corestore(tmpdir)
  await store.ready()
  const drive = new Hyperdrive(store)
  await drive.ready()

  await drive.put('/index.js', 'require("./missing.js")')

  const pearShaker = new PearShaker(drive, ['/index.js'])
  await t.exception(async () => pearShaker.run())
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
