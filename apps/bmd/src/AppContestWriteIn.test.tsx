import React from 'react'
import { fireEvent, render, wait, within } from '@testing-library/react'

import App from './App'

import withMarkup from '../test/helpers/withMarkup'

import {
  advanceTimers,
  getNewVoterCard,
  advanceTimersAndPromises,
} from '../test/helpers/smartcards'

import {
  singleSeatContestWithWriteIn,
  setElectionInStorage,
  setStateInStorage,
} from '../test/helpers/election'
import { VxMarkPlusVxPrint } from './config/types'
import { MemoryCard } from './utils/Card'
import { MemoryStorage } from './utils/Storage'
import { AppStorage } from './AppRoot'
import fakePrinter from '../test/helpers/fakePrinter'
import { MemoryHardware } from './utils/Hardware'
import { fakeMachineConfigProvider } from '../test/helpers/fakeMachineConfig'

jest.useFakeTimers()

beforeEach(() => {
  window.location.href = '/'
})

it('Single Seat Contest with Write In', async () => {
  // ====================== BEGIN CONTEST SETUP ====================== //

  const card = new MemoryCard()
  const printer = fakePrinter()
  const hardware = MemoryHardware.standard
  const storage = new MemoryStorage<AppStorage>()
  const machineConfig = fakeMachineConfigProvider({
    appMode: VxMarkPlusVxPrint,
  })

  setElectionInStorage(storage)
  setStateInStorage(storage)

  const { container, getByText, queryByText, getByTestId } = render(
    <App
      card={card}
      hardware={hardware}
      printer={printer}
      storage={storage}
      machineConfig={machineConfig}
    />
  )
  const getByTextWithMarkup = withMarkup(getByText)

  const getWithinKeyboard = (text: string) =>
    within(getByTestId('virtual-keyboard')).getByText(text)

  // Insert Voter Card
  card.insertCard(getNewVoterCard())
  await advanceTimersAndPromises()

  // Go to First Contest
  fireEvent.click(getByText('Start Voting'))
  advanceTimers()

  // ====================== END CONTEST SETUP ====================== //

  // Advance to Single-Seat Contest with Write-In
  while (!queryByText(singleSeatContestWithWriteIn.title)) {
    fireEvent.click(getByText('Next'))
    advanceTimers()
  }

  // Test Write-In Candidate Modal Cancel
  fireEvent.click(getByText('add write-in candidate').closest('button')!)
  fireEvent.click(getByText('Cancel'))

  // Add Write-In Candidate
  fireEvent.click(getByText('add write-in candidate').closest('button')!)
  expect(getByText('Write-In Candidate')).toBeTruthy()
  // Capture styles of Single Candidate Contest
  expect(container.firstChild).toMatchSnapshot()

  // Enter Write-in Candidate Name
  fireEvent.click(getWithinKeyboard('B'))
  fireEvent.click(getWithinKeyboard('O'))
  fireEvent.click(getWithinKeyboard('V'))
  fireEvent.click(getWithinKeyboard('⌫ delete'))
  fireEvent.click(getWithinKeyboard('B'))
  fireEvent.click(getByText('Accept'))
  advanceTimers()

  // Remove Write-In Candidate
  fireEvent.click(getByText('BOB').closest('button')!)
  fireEvent.click(getByText('Yes, Remove.'))
  advanceTimers()

  // Add Different Write-In Candidate
  fireEvent.click(getByText('add write-in candidate').closest('button')!)
  fireEvent.click(getWithinKeyboard('S').closest('button')!)
  fireEvent.click(getWithinKeyboard('A').closest('button')!)
  fireEvent.click(getWithinKeyboard('L').closest('button')!)
  fireEvent.click(getByText('Accept'))
  expect(getByText('SAL').closest('button')!.dataset.selected).toBe('true')

  // Try to Select Other Candidate when max candidates are selected.
  fireEvent.click(
    getByText(singleSeatContestWithWriteIn.candidates[0].name).closest(
      'button'
    )!
  )
  getByText(
    `You may only select ${singleSeatContestWithWriteIn.seats} candidate in this contest. To vote for ${singleSeatContestWithWriteIn.candidates[0].name}, you must first unselect the selected candidate.`
  )
  fireEvent.click(getByText('Okay'))

  // Try to add another write-in when max candidates are selected.
  fireEvent.click(getByText('add write-in candidate').closest('button')!)
  getByText(
    `You may only select ${singleSeatContestWithWriteIn.seats} candidate in this contest. To vote for a write-in candidate, you must first unselect the selected candidate.`
  )
  fireEvent.click(getByText('Okay'))

  // Go to review page and confirm write in exists
  while (!queryByText('Review Your Votes')) {
    fireEvent.click(getByText('Next'))
    advanceTimers()
  }

  // Review Screen
  await wait(() => getByText('Review Your Votes'))
  expect(getByText('SAL')).toBeTruthy()
  expect(getByText('(write-in)')).toBeTruthy()

  // Print Screen
  fireEvent.click(getByTextWithMarkup('I’m Ready to Print My Ballot'))
  advanceTimers()
  expect(getByText('Official Ballot')).toBeTruthy()
  expect(getByText('(write-in)')).toBeTruthy()
  getByText('Printing Official Ballot')

  // Printer has new job
  advanceTimers()
  await wait(() => expect(printer.print).toHaveBeenCalledTimes(1))
})
