import { croppedQRCode } from '../test/fixtures'
import { blankPage1 } from '../test/fixtures/election-4e31cb17d8-ballot-style-77-precinct-oaklawn-branch-library'
import { decodeSearchParams, detect } from './metadata'
import { jsqr } from './utils/qrcode'

test('URL decoding', () => {
  expect(
    decodeSearchParams(
      new URLSearchParams([
        ['t', 'tt'],
        ['pr', 'Acme & Co'],
        ['bs', 'Ballot Style Orange'],
        ['p', '2-3'],
        ['l1', 'en-US'],
        ['l2', 'es-US'],
      ])
    )
  ).toEqual({
    locales: { primary: 'en-US', secondary: 'es-US' },
    ballotStyleId: 'Ballot Style Orange',
    precinctId: 'Acme & Co',
    isTestBallot: true,
    pageNumber: 2,
    pageCount: 3,
  })
})

test('omitted secondary locale code', () => {
  expect(
    decodeSearchParams(
      new URLSearchParams([
        ['t', 'tt'],
        ['pr', 'Acme & Co'],
        ['bs', 'Ballot Style Orange'],
        ['p', '2-3'],
        ['l1', 'en-US'],
      ])
    )
  ).toEqual({
    locales: { primary: 'en-US' },
    ballotStyleId: 'Ballot Style Orange',
    precinctId: 'Acme & Co',
    isTestBallot: true,
    pageNumber: 2,
    pageCount: 3,
  })
})

test('live mode', () => {
  expect(
    decodeSearchParams(
      new URLSearchParams([
        ['t', '_t'],
        ['pr', ''],
        ['bs', ''],
        ['p', '1-1'],
        ['l1', 'en-US'],
      ])
    )
  ).toEqual(expect.objectContaining({ isTestBallot: false }))
})

test('cropped QR code', async () => {
  await expect(detect(await croppedQRCode.imageData())).rejects.toThrow(
    'Expected QR code not found.'
  )
})

test('ballot', async () => {
  expect(await detect(await blankPage1.imageData())).toEqual({
    metadata: {
      ballotStyleId: '77',
      precinctId: '42',
      isTestBallot: false,
      pageNumber: 1,
      pageCount: 2,
    },
    flipped: false,
  })
})

test('alternate QR code reader', async () => {
  expect(
    await detect(await blankPage1.imageData(), { detectQRCode: jsqr })
  ).toEqual({
    metadata: {
      ballotStyleId: '77',
      precinctId: '42',
      isTestBallot: false,
      pageNumber: 1,
      pageCount: 2,
    },
    flipped: false,
  })
})

test('custom QR code reader', async () => {
  expect(
    await detect(await blankPage1.imageData(), {
      detectQRCode: async () => ({
        data: Buffer.from('https://ballot.page?t=_&pr=11&bs=22&p=3-4'),
      }),
    })
  ).toEqual({
    metadata: {
      ballotStyleId: '22',
      precinctId: '11',
      isTestBallot: false,
      pageNumber: 3,
      pageCount: 4,
    },
    flipped: false,
  })
})

test('upside-down ballot images', async () => {
  expect(await detect(await blankPage1.imageData({ flipped: true }))).toEqual({
    metadata: {
      ballotStyleId: '77',
      precinctId: '42',
      isTestBallot: false,
      pageNumber: 1,
      pageCount: 2,
    },
    flipped: true,
  })
})