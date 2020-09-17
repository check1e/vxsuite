import React, { useContext, useState, useEffect } from 'react'
import styled from 'styled-components'

import { useParams, useHistory } from 'react-router-dom'
import { HorizontalRule, Prose, Text } from '@votingworks/hmpb-ui'
import find from '../utils/find'

import {
  fullTallyVotes,
  getContestTallyMeta,
  filterTalliesByParty,
} from '../lib/votecounting'

import {
  PrecinctReportScreenProps,
  ScannerReportScreenProps,
} from '../config/types'
import AppContext from '../contexts/AppContext'

import PrintButton from '../components/PrintButton'
import Button from '../components/Button'
import ContestTally from '../components/ContestTally'
import NavigationScreen from '../components/NavigationScreen'
import LinkButton from '../components/LinkButton'
import routerPaths from '../routerPaths'
import {
  localeWeedkayAndDate,
  localeLongDateAndTime,
} from '../utils/IntlDateTimeFormats'

const TallyHeader = styled.div`
  page-break-before: always;
  h1 + p {
    margin-top: -1.5em;
  }
`

const TallyReportScreen = () => {
  const history = useHistory()

  const { precinctId } = useParams<PrecinctReportScreenProps>()
  const { scannerId } = useParams<ScannerReportScreenProps>()
  const {
    castVoteRecordFiles,
    electionDefinition,
    isOfficialResults,
  } = useContext(AppContext)

  // the point of this state and effect is to show a loading screen
  // and almost immediately trigger removing the loading screen,
  // which will then trigger the computation of the tally.
  //
  // because the computation takes a while and blocks the main thread
  // (which we should fix, of course), the loading screen effectively
  // stays on the screen as long as it takes to prepare the report.
  const [isLoading, setIsLoading] = useState(true)
  useEffect(() => {
    window.setTimeout(() => {
      setIsLoading(false)
    }, 100)
  })

  if (isLoading) {
    return (
      <NavigationScreen mainChildCenter>
        <Prose textCenter>
          <h1>Building Tabulation Report...</h1>
          <p>This may take a few seconds.</p>
        </Prose>
      </NavigationScreen>
    )
  }

  const { election } = electionDefinition!
  const statusPrefix = isOfficialResults ? 'Official' : 'Unofficial'

  const castVoteRecords = castVoteRecordFiles.castVoteRecords.flat(1)

  if (castVoteRecords.length === 0) {
    history.replace(routerPaths.tally)
  }

  const fullElectionTally = fullTallyVotes({
    election,
    castVoteRecords,
  })

  const contestTallyMeta = getContestTallyMeta({
    election,
    castVoteRecords,
    precinctId,
    scannerId,
  })

  const electionPrecinctTallies = Object.values(
    fullElectionTally.precinctTallies
  )

  const electionScannerTallies = Object.values(fullElectionTally.scannerTallies)

  const ballotStylePartyIds = Array.from(
    new Set(election.ballotStyles.map((bs) => bs.partyId))
  )

  const precinctName =
    precinctId && find(election.precincts, (p) => p.id === precinctId).name

  const electionDate = localeWeedkayAndDate.format(new Date(election.date))
  const generatedAt = localeLongDateAndTime.format(new Date())

  const saveAsPDF = async () => {
    const precinctNameInFileName = precinctName || 'all-precincts'
    const data = await window.kiosk!.printToPDF()
    const fileWriter = await window.kiosk!.saveAs({
      defaultPath: `${`tabulation-report-${election.county.name}-${election.title}`
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/(^-|-$)+/g, '')
        .toLocaleLowerCase()}-${precinctNameInFileName}.pdf`,
    })
    if (!fileWriter) {
      window.alert(
        'Could not save PDF, it can only be saved to a USB device. (Or if "Cancel" was selected, ignore this message.)'
      )
      return
    }
    fileWriter.write(data)
    await fileWriter.end()
  }

  const reportMeta = (
    <p>
      {electionDate}, {election.county.name}, {election.state}
      <br />
      <Text small as="span">
        This report was created on {generatedAt}
      </Text>
    </p>
  )

  const reportDisplayTitle = () => {
    if (precinctName) {
      return `${statusPrefix} Precinct Tally Report for ${precinctName}`
    }
    if (scannerId) {
      return `${statusPrefix} Scanner Tally Report for Scanner ${scannerId}`
    }
    return `${statusPrefix} ${election.title} Tally Report`
  }

  return (
    <React.Fragment>
      <NavigationScreen>
        <Prose className="no-print">
          <h1>{reportDisplayTitle()}</h1>
          {reportMeta}
          <p>
            <PrintButton primary>Print {statusPrefix} Tally Report</PrintButton>
          </p>
          {window.kiosk && (
            <p>
              <Button onPress={saveAsPDF}>
                Save {statusPrefix} Tally Report as PDF
              </Button>
            </p>
          )}
          <p>
            <LinkButton small to={routerPaths.tally}>
              Back to Tally Index
            </LinkButton>
          </p>
        </Prose>
      </NavigationScreen>
      <div className="print-only">
        {ballotStylePartyIds.map((partyId) => {
          let precinctTallies = electionPrecinctTallies
          let scannerTallies = electionScannerTallies
          let { overallTally } = fullElectionTally

          const party = election.parties.find((p) => p.id === partyId)
          const electionTitle = party
            ? `${party.fullName} ${election.title}`
            : election.title

          if (party) {
            overallTally = filterTalliesByParty({
              election,
              electionTally: fullElectionTally.overallTally,
              party,
            })
            precinctTallies = electionPrecinctTallies.map((precinctTally) =>
              filterTalliesByParty({
                election,
                electionTally: precinctTally!,
                party,
              })
            )
            scannerTallies = electionScannerTallies.map((scannerTally) =>
              filterTalliesByParty({
                election,
                electionTally: scannerTally!,
                party,
              })
            )
          }

          if (precinctId) {
            precinctTallies = precinctTallies.filter(
              (pt) => pt?.precinctId === precinctId
            )
            return precinctTallies.map((precinctTally) => {
              const precinctid = precinctTally?.precinctId
              const precinctName = find(
                election.precincts,
                (p) => p.id === precinctid
              ).name
              return (
                <React.Fragment key={`${partyId}-${precinctid}` || 'none'}>
                  <TallyHeader key={precinctid}>
                    <Prose maxWidth={false}>
                      <h1>
                        {statusPrefix} Precinct Tally Report for: {precinctName}
                      </h1>
                      {reportMeta}
                    </Prose>
                  </TallyHeader>
                  <HorizontalRule />
                  <ContestTally
                    election={election}
                    electionTally={precinctTally!}
                    contestTallyMeta={contestTallyMeta}
                  />
                </React.Fragment>
              )
            })
          }

          if (scannerId) {
            scannerTallies = scannerTallies.filter(
              (pt) => pt?.scannerId === scannerId
            )
            return scannerTallies.map((scannerTally) => {
              const scannerId = scannerTally?.scannerId
              return (
                <React.Fragment key={`${partyId}-${scannerId}` || 'none'}>
                  <TallyHeader key={scannerId}>
                    <Prose maxWidth={false}>
                      <h1>
                        {statusPrefix} Scanner Tally Report for Scanner{' '}
                        {scannerId}
                      </h1>
                      {reportMeta}
                    </Prose>
                  </TallyHeader>
                  <HorizontalRule />
                  <ContestTally
                    election={election}
                    electionTally={scannerTally!}
                    contestTallyMeta={contestTallyMeta}
                  />
                </React.Fragment>
              )
            })
          }

          return (
            <React.Fragment key={partyId || 'none'}>
              <TallyHeader>
                <Prose maxWidth={false}>
                  <h1>
                    {statusPrefix} {electionTitle} Tally Report
                  </h1>
                  {reportMeta}
                </Prose>
              </TallyHeader>
              <HorizontalRule />
              <div data-testid="tally-report-contents">
                <ContestTally
                  election={election}
                  electionTally={overallTally}
                  contestTallyMeta={contestTallyMeta}
                />
              </div>
            </React.Fragment>
          )
        })}
      </div>
    </React.Fragment>
  )
}

export default TallyReportScreen