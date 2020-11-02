import { electionSample } from '@votingworks/ballot-encoder'
import getAllBallotConfigs from './getAllBallotConfigs'
import { DEFAULT_LOCALE } from '../config/globals'

test('builds a list of configs for single-language ballots', () => {
  expect(getAllBallotConfigs(electionSample, 'abcde', [DEFAULT_LOCALE]))
    .toMatchInlineSnapshot(`
    Array [
      Object {
        "ballotStyleId": "5",
        "contestIds": Array [
          "president",
          "representative-district-6",
          "lieutenant-governor",
          "state-senator-district-31",
          "state-assembly-district-54",
          "county-registrar-of-wills",
          "judicial-robert-demergue",
          "question-a",
          "question-b",
          "proposition-1",
          "102",
        ],
        "filename": "live/election-abcde-precinct-north-springfield-id-21-style-5-English.pdf",
        "isLiveMode": true,
        "locales": Object {
          "primary": "en-US",
          "secondary": undefined,
        },
        "precinctId": "21",
      },
      Object {
        "ballotStyleId": "5",
        "contestIds": Array [
          "president",
          "representative-district-6",
          "lieutenant-governor",
          "state-senator-district-31",
          "state-assembly-district-54",
          "county-registrar-of-wills",
          "judicial-robert-demergue",
          "question-a",
          "question-b",
          "proposition-1",
          "102",
        ],
        "filename": "test/election-abcde-precinct-north-springfield-id-21-style-5-English.pdf",
        "isLiveMode": false,
        "locales": Object {
          "primary": "en-US",
          "secondary": undefined,
        },
        "precinctId": "21",
      },
      Object {
        "ballotStyleId": "7C",
        "contestIds": Array [
          "primary-constitution-head-of-party",
        ],
        "filename": "live/election-abcde-precinct-south-springfield-id-20-style-7C-English.pdf",
        "isLiveMode": true,
        "locales": Object {
          "primary": "en-US",
          "secondary": undefined,
        },
        "precinctId": "20",
      },
      Object {
        "ballotStyleId": "7C",
        "contestIds": Array [
          "primary-constitution-head-of-party",
        ],
        "filename": "test/election-abcde-precinct-south-springfield-id-20-style-7C-English.pdf",
        "isLiveMode": false,
        "locales": Object {
          "primary": "en-US",
          "secondary": undefined,
        },
        "precinctId": "20",
      },
      Object {
        "ballotStyleId": "12",
        "contestIds": Array [
          "president",
          "senator",
          "representative-district-6",
          "governor",
          "lieutenant-governor",
          "secretary-of-state",
          "state-senator-district-31",
          "state-assembly-district-54",
          "county-commissioners",
          "county-registrar-of-wills",
          "city-mayor",
          "city-council",
          "judicial-robert-demergue",
          "judicial-elmer-hull",
          "question-a",
          "question-b",
          "question-c",
          "proposition-1",
          "measure-101",
          "102",
        ],
        "filename": "live/election-abcde-precinct-center-springfield-id-23-style-12-English.pdf",
        "isLiveMode": true,
        "locales": Object {
          "primary": "en-US",
          "secondary": undefined,
        },
        "precinctId": "23",
      },
      Object {
        "ballotStyleId": "12",
        "contestIds": Array [
          "president",
          "senator",
          "representative-district-6",
          "governor",
          "lieutenant-governor",
          "secretary-of-state",
          "state-senator-district-31",
          "state-assembly-district-54",
          "county-commissioners",
          "county-registrar-of-wills",
          "city-mayor",
          "city-council",
          "judicial-robert-demergue",
          "judicial-elmer-hull",
          "question-a",
          "question-b",
          "question-c",
          "proposition-1",
          "measure-101",
          "102",
        ],
        "filename": "test/election-abcde-precinct-center-springfield-id-23-style-12-English.pdf",
        "isLiveMode": false,
        "locales": Object {
          "primary": "en-US",
          "secondary": undefined,
        },
        "precinctId": "23",
      },
      Object {
        "ballotStyleId": "12",
        "contestIds": Array [
          "president",
          "senator",
          "representative-district-6",
          "governor",
          "lieutenant-governor",
          "secretary-of-state",
          "state-senator-district-31",
          "state-assembly-district-54",
          "county-commissioners",
          "county-registrar-of-wills",
          "city-mayor",
          "city-council",
          "judicial-robert-demergue",
          "judicial-elmer-hull",
          "question-a",
          "question-b",
          "question-c",
          "proposition-1",
          "measure-101",
          "102",
        ],
        "filename": "live/election-abcde-precinct-north-springfield-id-21-style-12-English.pdf",
        "isLiveMode": true,
        "locales": Object {
          "primary": "en-US",
          "secondary": undefined,
        },
        "precinctId": "21",
      },
      Object {
        "ballotStyleId": "12",
        "contestIds": Array [
          "president",
          "senator",
          "representative-district-6",
          "governor",
          "lieutenant-governor",
          "secretary-of-state",
          "state-senator-district-31",
          "state-assembly-district-54",
          "county-commissioners",
          "county-registrar-of-wills",
          "city-mayor",
          "city-council",
          "judicial-robert-demergue",
          "judicial-elmer-hull",
          "question-a",
          "question-b",
          "question-c",
          "proposition-1",
          "measure-101",
          "102",
        ],
        "filename": "test/election-abcde-precinct-north-springfield-id-21-style-12-English.pdf",
        "isLiveMode": false,
        "locales": Object {
          "primary": "en-US",
          "secondary": undefined,
        },
        "precinctId": "21",
      },
    ]
  `)
})
