import { electionSample } from '@votingworks/ballot-encoder'
import { join } from 'path'
import hmpbElection from '../test/fixtures/hmpb-dallas-county/election'
import SummaryBallotInterpreter, { getBallotImageData } from './interpreter'

const sampleBallotImagesPath = join(__dirname, '..', 'sample-ballot-images/')
const electionFixturesRoot = join(
  __dirname,
  '..',
  'test/fixtures/hmpb-dallas-county'
)

test('reads QR codes from ballot images #1', async () => {
  const { qrcode } = await getBallotImageData(
    join(sampleBallotImagesPath, 'sample-batch-1-ballot-1.jpg')
  )

  expect(qrcode).toEqual(
    Buffer.from('12.23.1|||||||||||||||||||.r6UYR4t7hEFMz8QlMWf1Sw')
  )
})

test('reads QR codes from ballot images #2', async () => {
  const { qrcode } = await getBallotImageData(
    join(sampleBallotImagesPath, 'sample-batch-1-ballot-2.jpg')
  )

  expect(qrcode).toEqual(
    Buffer.from(
      '12.23.3|1|1|1|0|0|||0,2,W||1|2|1|0||||1||0.85lnPkvfNEytP3Z8gMoEcA'
    )
  )
})

test('does not find QR codes when there are none to find', async () => {
  await expect(
    getBallotImageData(join(sampleBallotImagesPath, 'not-a-ballot.jpg'))
  ).rejects.toThrowError('no QR code found')
})

test('extracts a CVR from votes encoded in a QR code', async () => {
  const cvr = await new SummaryBallotInterpreter().interpretFile({
    election: electionSample,
    ballotImagePath: join(
      sampleBallotImagesPath,
      'sample-batch-1-ballot-1.jpg'
    ),
  })
  expect(cvr).toEqual(
    expect.objectContaining({
      _ballotId: 'r6UYR4t7hEFMz8QlMWf1Sw',
      _ballotStyleId: '12',
      _precinctId: '23',
      president: ['cramer-vuocolo'],
    })
  )
})

test('interprets marks on a HMPB', async () => {
  const interpreter = new SummaryBallotInterpreter()

  await interpreter.addHmpbTemplate(
    hmpbElection,
    (await getBallotImageData(join(electionFixturesRoot, 'blank-p1.jpg'))).image
  )

  await interpreter.addHmpbTemplate(
    hmpbElection,
    (await getBallotImageData(join(electionFixturesRoot, 'blank-p2.jpg'))).image
  )

  expect(
    await interpreter.interpretFile({
      election: hmpbElection,
      ballotImagePath: join(electionFixturesRoot, 'filled-in-p1.jpg'),
    })
  ).toEqual(
    expect.objectContaining({
      _ballotStyleId: '77',
      _precinctId: '42',
      'dallas-city-council': '',
      'dallas-county-commissioners-court-pct-3': '',
      'dallas-county-proposition-r': '',
      'dallas-county-retain-chief-justice': '',
      'dallas-county-sheriff': ['chad-prda'],
      'dallas-county-tax-assessor': ['john-ames'],
      'dallas-mayor': '',
      'texas-house-district-111': ['writein'],
      'texas-sc-judge-place-6': ['jane-bland'],
      'us-house-district-30': ['eddie-bernice-johnson'],
      'us-senate': ['tim-smith'],
    })
  )
})

test('interprets marks on an upside-down HMPB', async () => {
  const interpreter = new SummaryBallotInterpreter()

  await interpreter.addHmpbTemplate(
    hmpbElection,
    (await getBallotImageData(join(electionFixturesRoot, 'blank-p1.jpg'))).image
  )

  await interpreter.addHmpbTemplate(
    hmpbElection,
    (await getBallotImageData(join(electionFixturesRoot, 'blank-p2.jpg'))).image
  )

  expect(
    await interpreter.interpretFile({
      election: hmpbElection,
      ballotImagePath: join(electionFixturesRoot, 'filled-in-p1-flipped.jpg'),
    })
  ).toEqual(
    expect.objectContaining({
      _ballotStyleId: '77',
      _precinctId: '42',
      'dallas-city-council': '',
      'dallas-county-commissioners-court-pct-3': '',
      'dallas-county-proposition-r': '',
      'dallas-county-retain-chief-justice': '',
      'dallas-county-sheriff': ['chad-prda'],
      'dallas-county-tax-assessor': ['john-ames'],
      'dallas-mayor': '',
      'texas-house-district-111': ['writein'],
      'texas-sc-judge-place-6': ['jane-bland'],
      'us-house-district-30': ['eddie-bernice-johnson'],
      'us-senate': ['tim-smith'],
    })
  )
})
