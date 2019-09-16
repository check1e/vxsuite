import React from 'react'
import { fireEvent, render, wait } from '@testing-library/react'
import fetchMock from 'fetch-mock'

import App from './App'

import {
  adminCard,
  advanceTimers,
  getNewVoterCard,
  noCard,
  pollWorkerCard,
} from '../test/helpers/smartcards'

import {
  electionAsString,
  presidentContest,
  measure102Contest,
  voterContests,
} from '../test/helpers/election'

let currentCard = noCard
fetchMock.get('/card/read', () => JSON.stringify(currentCard))

fetchMock.post('/card/write', (url, options) => {
  currentCard = {
    present: true,
    shortValue: options.body as string,
  }
  return ''
})

fetchMock.get('/card/read_long', () =>
  JSON.stringify({ longValue: electionAsString })
)

beforeEach(() => {
  window.localStorage.clear()
  window.location.href = '/'
})

it('VxMarkOnly flow', async () => {
  jest.useFakeTimers()

  const { getByText } = render(<App />)

  currentCard = noCard
  advanceTimers()

  // Default Unconfigured
  getByText('Device Not Configured')

  // ---------------

  // Configure with Admin Card
  currentCard = adminCard
  advanceTimers()
  await wait(() => fireEvent.click(getByText('Load Election Definition')))

  advanceTimers()
  await wait(() => getByText('Election definition is loaded.'))

  expect((getByText('VxMark Only') as HTMLButtonElement).disabled).toBeTruthy()

  fireEvent.click(getByText('Live Election Mode'))
  getByText('Switch to Live Election Mode and zero Printed Ballots count?')
  fireEvent.click(getByText('Yes'))

  expect(
    (getByText('Live Election Mode') as HTMLButtonElement).disabled
  ).toBeTruthy()

  // Remove card
  currentCard = noCard
  advanceTimers()
  await wait(() => getByText('Polls Closed'))
  getByText('Insert Poll Worker card to open.')

  // ---------------

  // Open Polls with Poll Worker Card
  currentCard = pollWorkerCard
  advanceTimers()
  await wait(() => fireEvent.click(getByText('Open Polls')))
  getByText('Close Polls')

  // Remove card
  currentCard = noCard
  advanceTimers()
  await wait(() => getByText('Insert voter card to load ballot.'))

  // ---------------

  // Complete VxMark Voter Happy Path

  // Insert Voter card
  currentCard = getNewVoterCard()
  advanceTimers()
  await wait(() => getByText(/Precinct: Center Springfield/))
  getByText(/Ballot Style: 12/)
  fireEvent.click(getByText('Get Started'))

  advanceTimers()
  getByText('This ballot has 20 contests.')
  fireEvent.click(getByText('Start Voting'))

  // Advance through every contest
  for (let i = 0; i < voterContests.length; i++) {
    const title = voterContests[i].title

    advanceTimers()
    getByText(title)

    // Vote for candidate contest
    if (title === presidentContest.title) {
      fireEvent.click(getByText(presidentContest.candidates[0].name))
    }
    // Vote for yesno contest
    else if (title === measure102Contest.title) {
      fireEvent.click(getByText('Yes'))
    }

    fireEvent.click(getByText('Next'))
  }

  // Pre-Review screen
  fireEvent.click(getByText('Next'))
  advanceTimers()
  getByText('Review Your Selections')
  fireEvent.click(getByText('Review Selections'))

  // Review Screen
  advanceTimers()
  getByText('Review Your Ballot Selections')
  getByText(presidentContest.candidates[0].name)
  getByText(`Yes on ${measure102Contest.shortTitle}`)

  // Print Screen
  fireEvent.click(getByText('Next'))
  advanceTimers()
  getByText('Take card to the Ballot Printer')

  // Remove card
  currentCard = noCard
  advanceTimers()
  await wait(() => getByText('Insert voter card to load ballot.'))

  // Unconfigure with Admin Card
  currentCard = adminCard
  advanceTimers()
  await wait(() => getByText('Election definition is loaded.'))
  fireEvent.click(getByText('Remove'))
  advanceTimers()

  // Default Unconfigured
  getByText('Device Not Configured')
})
