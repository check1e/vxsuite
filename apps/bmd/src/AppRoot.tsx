import React from 'react'
import Gamepad from 'react-gamepad'
import { RouteComponentProps } from 'react-router-dom'

import * as GLOBALS from './config/globals'

import 'normalize.css'
import './App.css'

import {
  handleGamepadButtonDown,
  handleGamepadKeyboardEvent,
} from './lib/gamepad'

import {
  ActivationData,
  AppMode,
  AppModeNames,
  CardAPI,
  CardData,
  Contests,
  Election,
  ElectionDefaults,
  InputEvent,
  MachineIdAPI,
  MarkVoterCardUsedFunction,
  MarkVoterCardUsedFunctionArgs,
  OptionalElection,
  OptionalVote,
  PartialUserSettings,
  UserSettings,
  VoterCardData,
  VotesDict,
  VxMarkOnly,
  VxMarkPlusVxPrint,
  VxPrintOnly,
  getAppMode,
} from './config/types'

import utcTimestamp from './utils/utcTimestamp'
import isEmptyObject from './utils/isEmptyObject'

import { getBallotStyle, getContests } from './utils/election'

import Ballot from './components/Ballot'
import BallotContext from './contexts/ballotContext'

import PrintOnlyScreen from './pages/PrintOnlyScreen'
import ClerkScreen from './pages/ClerkScreen'
import PollWorkerScreen from './pages/PollWorkerScreen'
import InsertCardScreen from './pages/InsertCardScreen'
import CastBallotPage from './pages/CastBallotPage'
import UnconfiguredScreen from './pages/UnconfiguredScreen'
import ExpiredCardScreen from './pages/ExpiredCardScreen'
import UsedCardScreen from './pages/UsedCardScreen'
import electionDefaults from './data/electionDefaults.json'
import electionSample from './data/electionSample.json'
import makePrinter, { PrintMethod } from './utils/printer'

export const mergeWithDefaults = (
  election: Election,
  defaults: ElectionDefaults = electionDefaults
) => ({ ...defaults, ...election })

interface CardState {
  isClerkCardPresent: boolean
  isPollWorkerCardPresent: boolean
  isRecentVoterPrint: boolean
  isVoterCardExpired: boolean
  isVoterCardPresent: boolean
  isVoterCardUsed: boolean
  pauseProcessingUntilNoCardPresent: boolean
}

interface UserState {
  ballotCreatedAt: number
  ballotStyleId: string
  contests: Contests
  precinctId: string
  userSettings: UserSettings
  votes: VotesDict
}

interface State extends CardState, UserState {
  appMode: AppMode
  ballotsPrintedCount: number
  election: OptionalElection
  isClerkCardPresent: boolean
  isFetchingElection: boolean
  isLiveMode: boolean
  isPollsOpen: boolean
  isPollWorkerCardPresent: boolean
  isRecentVoterPrint: boolean
  isVoterCardExpired: boolean
  isVoterCardPresent: boolean
  isVoterCardUsed: boolean
  machineId: string
  pauseProcessingUntilNoCardPresent: boolean
  shortValue: string
}

export const electionStorageKey = 'election'
export const stateStorageKey = 'state'
export const activationStorageKey = 'activation'
const votesStorageKey = 'votes'

const initialCardPresentState: CardState = {
  isClerkCardPresent: false,
  isPollWorkerCardPresent: false,
  isRecentVoterPrint: false,
  isVoterCardExpired: false,
  isVoterCardPresent: false,
  isVoterCardUsed: false,
  pauseProcessingUntilNoCardPresent: false,
}

const initialUserState: UserState = {
  ballotCreatedAt: 0,
  ballotStyleId: '',
  contests: [],
  precinctId: '',
  userSettings: { textSize: GLOBALS.TEXT_SIZE },
  votes: {},
}

const initialState: State = {
  ...initialUserState,
  ...initialCardPresentState,
  appMode: VxMarkOnly,
  ballotsPrintedCount: 0,
  election: undefined,
  isFetchingElection: false,
  isLiveMode: false,
  isPollsOpen: false,
  machineId: '---',
  shortValue: '{}',
}

let checkCardInterval = 0

const printer = makePrinter(PrintMethod.RemoteWithLocalFallback)

class AppRoot extends React.Component<RouteComponentProps, State> {
  public state = initialState
  private machineIdAbortController = new AbortController()

  public processVoterCardData = (voterCardData: VoterCardData) => {
    const election = this.state.election!
    const ballotStyle = getBallotStyle({
      ballotStyleId: voterCardData.bs,
      election,
    })
    const precinct = election.precincts.find(pr => pr.id === voterCardData.pr)!
    this.activateBallot({
      ballotCreatedAt: voterCardData.c,
      ballotStyle,
      precinct,
    })
  }

  public fetchElection = async () => {
    this.setState({ isFetchingElection: true })
    try {
      const response = await fetch('/card/read_long')
      const election = await response.json()
      this.setElection(JSON.parse(election.longValue))
    } finally {
      this.setState({ isFetchingElection: false })
    }
  }

  public isVoterCardExpired = (createdAt: number): boolean =>
    utcTimestamp() >= createdAt + GLOBALS.CARD_EXPIRATION_SECONDS

  public processCard = ({ longValueExists, shortValue }: CardAPI) => {
    const cardData: CardData = JSON.parse(shortValue)
    switch (cardData.t) {
      case 'voter': {
        const voterCardData = cardData as VoterCardData
        const isVoterCardExpired = this.isVoterCardExpired(voterCardData.c)
        const isBallotPrinted = Boolean(voterCardData.bp)
        const ballotUsedTime = Number(voterCardData.uz) || 0
        const isVoterCardUsed = Boolean(ballotUsedTime)
        const votes: VotesDict = voterCardData.v || {}
        const recentPrintExpirationSeconds = 60
        const isRecentVoterPrint =
          isBallotPrinted &&
          utcTimestamp() <= ballotUsedTime + recentPrintExpirationSeconds
        this.setState({
          ...initialCardPresentState,
          shortValue,
          isVoterCardExpired,
          isVoterCardPresent: true,
          isVoterCardUsed,
          isRecentVoterPrint,
          votes,
        })
        if (!isVoterCardUsed && !isVoterCardExpired) {
          this.processVoterCardData(voterCardData)
        }
        break
      }
      case 'pollworker': {
        this.setState({
          ...initialCardPresentState,
          isPollWorkerCardPresent: true,
        })
        break
      }
      case 'clerk': {
        longValueExists &&
          this.setState({
            ...initialCardPresentState,
            isClerkCardPresent: true,
          })
        break
      }
    }
  }

  public startPolling = () => {
    if (checkCardInterval === 0) {
      let lastCardDataString = ''

      checkCardInterval = window.setInterval(async () => {
        try {
          const card = await this.readCard()
          if (this.state.pauseProcessingUntilNoCardPresent) {
            if (card.present) {
              return
            }
            this.togglePauseProcessingUntilNoCardPresent(false)
          }
          const currentCardDataString = JSON.stringify(card)
          if (currentCardDataString === lastCardDataString) {
            return
          }
          lastCardDataString = currentCardDataString

          if (!card.present || !card.shortValue) {
            this.resetBallot()
            return
          }

          this.processCard(card)
        } catch (error) {
          this.resetBallot()
          lastCardDataString = ''
          this.stopPolling() // Assume backend is unavailable.
        }
      }, GLOBALS.CARD_POLLING_INTERVAL)
    }
  }

  public stopPolling = () => {
    window.clearInterval(checkCardInterval)
    checkCardInterval = 0 // To indicate setInterval is not running.
  }

  public togglePauseProcessingUntilNoCardPresent = (b?: boolean) => {
    this.setState(prevState => ({
      pauseProcessingUntilNoCardPresent:
        b || !prevState.pauseProcessingUntilNoCardPresent,
    }))
  }

  public markVoterCardUsed: MarkVoterCardUsedFunction = async ({
    markBallotPrinted = true,
    pauseProcessingUntilNoCardPresent = false,
  }: MarkVoterCardUsedFunctionArgs = {}) => {
    this.stopPolling()

    const currentVoterCardData: VoterCardData = JSON.parse(
      this.state.shortValue
    )

    const usedVoterCardData: VoterCardData = {
      ...currentVoterCardData,
      v: undefined,
      uz: utcTimestamp(),
      bp: markBallotPrinted ? 1 : 0,
    }
    await this.writeCard(usedVoterCardData)

    const updatedCard = await this.readCard()
    const updatedShortValue: VoterCardData = updatedCard.shortValue
      ? JSON.parse(updatedCard.shortValue)
      : {}

    if (pauseProcessingUntilNoCardPresent) {
      this.togglePauseProcessingUntilNoCardPresent(true)
    }

    this.startPolling()

    if (
      usedVoterCardData.v !== updatedShortValue.v ||
      usedVoterCardData.bp !== updatedShortValue.bp ||
      usedVoterCardData.uz !== updatedShortValue.uz
    ) {
      this.resetBallot()
      return false
    }
    return true
  }

  public componentDidMount = () => {
    if (window.location.hash === '#sample') {
      checkCardInterval = 1 // don't poll for card data.
      this.setState(
        {
          election: mergeWithDefaults(electionSample as Election),
          ballotsPrintedCount: 0,
          isLiveMode: true,
          isPollsOpen: true,
          ballotCreatedAt: utcTimestamp(),
          ballotStyleId: '12',
          precinctId: '23',
        },
        () => {
          const {
            ballotCreatedAt,
            ballotStyleId,
            precinctId,
            election,
          } = this.state
          this.setBallotActivation({
            ballotCreatedAt,
            ballotStyleId,
            precinctId,
          })
          this.setElection(election as Election)
          this.setStoredState()
          const voterCardData: VoterCardData = {
            c: utcTimestamp(),
            t: 'voter',
            bs: ballotStyleId,
            pr: precinctId,
          }
          this.processCard({
            present: true,
            shortValue: JSON.stringify(voterCardData),
            longValueExists: false,
          })
        }
      )
    } else {
      const election = this.getElection()
      const { ballotStyleId, precinctId } = this.getBallotActivation()
      const {
        appMode = initialState.appMode,
        ballotsPrintedCount = initialState.ballotsPrintedCount,
        isLiveMode = initialState.isLiveMode,
        isPollsOpen = initialState.isPollsOpen,
      } = this.getStoredState()
      const ballotStyle =
        ballotStyleId &&
        election &&
        getBallotStyle({
          ballotStyleId,
          election,
        })
      const contests =
        ballotStyle && election
          ? getContests({ ballotStyle, election })
          : initialState.contests
      this.setState({
        appMode,
        ballotsPrintedCount,
        ballotStyleId,
        contests,
        election,
        isLiveMode,
        isPollsOpen,
        precinctId,
        votes: this.getVotes(),
      })
    }
    document.addEventListener('keydown', handleGamepadKeyboardEvent)
    document.documentElement.setAttribute('data-useragent', navigator.userAgent)
    this.setDocumentFontSize()
    this.setMachineId()
    this.startPolling()
  }

  public componentWillUnmount = /* istanbul ignore next - triggering keystrokes issue - https://github.com/votingworks/bmd/issues/62 */ () => {
    this.machineIdAbortController.abort()
    document.removeEventListener('keydown', handleGamepadKeyboardEvent)
    this.stopPolling()
  }

  public setMachineId = async () => {
    const { signal } = this.machineIdAbortController
    try {
      const response = await fetch('/machine-id', { signal })
      const { machineId }: MachineIdAPI = await response.json()
      machineId && this.setState({ machineId })
    } catch (error) {
      // TODO: what should happen if `machineId` is not returned?
    }
  }

  public readCard = async (): Promise<CardAPI> => {
    const response = await fetch('/card/read')
    const card = await response.json()
    return card
  }

  public writeCard = async (cardData: VoterCardData) => {
    const newCardData: VoterCardData = {
      ...cardData,
      u: utcTimestamp(),
    }
    await fetch('/card/write', {
      method: 'post',
      body: JSON.stringify(newCardData),
      headers: { 'Content-Type': 'application/json' },
    })
  }

  public getElection = (): OptionalElection => {
    const election = window.localStorage.getItem(electionStorageKey)
    return election ? JSON.parse(election) : undefined
  }

  public setElection = (electionConfigFile: Election) => {
    const election = mergeWithDefaults(electionConfigFile)
    this.setState({ election })
    window.localStorage.setItem(electionStorageKey, JSON.stringify(election))
  }

  public getBallotActivation = () => {
    const activationData = window.localStorage.getItem(activationStorageKey)
    return activationData ? JSON.parse(activationData) : {}
  }

  public setBallotActivation = (data: {
    ballotCreatedAt: number
    ballotStyleId: string
    precinctId: string
  }) => {
    /* istanbul ignore else */
    if (process.env.NODE_ENV !== 'production') {
      window.localStorage.setItem(activationStorageKey, JSON.stringify(data))
    }
  }

  public getVotes = () => {
    const votesData = window.localStorage.getItem(votesStorageKey)
    return votesData ? JSON.parse(votesData) : {}
  }

  public setVotes = async (votes: VotesDict) => {
    /* istanbul ignore else */
    if (process.env.NODE_ENV !== 'production') {
      window.localStorage.setItem(votesStorageKey, JSON.stringify(votes))
    }
    const currentVoterCardData: VoterCardData = JSON.parse(
      this.state.shortValue
    )

    const newVoterCardData: VoterCardData = {
      ...currentVoterCardData,
      m: this.state.machineId,
      v: votes,
    }
    await this.writeCard(newVoterCardData)
  }

  public resetVoterData = () => {
    window.localStorage.removeItem(activationStorageKey)
    window.localStorage.removeItem(votesStorageKey)
  }

  public unconfigure = () => {
    this.setState(initialState)
    window.localStorage.clear()
    this.props.history.push('/')
  }

  public setStoredState = () => {
    const { appMode, ballotsPrintedCount, isLiveMode, isPollsOpen } = this.state
    window.localStorage.setItem(
      stateStorageKey,
      JSON.stringify({
        appMode,
        ballotsPrintedCount,
        isLiveMode,
        isPollsOpen,
      })
    )
  }

  public getStoredState = (): Partial<State> => {
    const storedStateJSON = window.localStorage.getItem(stateStorageKey)
    const storedState: Partial<State> = storedStateJSON
      ? JSON.parse(storedStateJSON)
      : {}

    if (storedState.appMode) {
      try {
        storedState.appMode = getAppMode(storedState.appMode.name)
      } catch {
        delete storedState.appMode
      }
    }

    return storedState
  }

  public updateVote = (contestId: string, vote: OptionalVote) => {
    this.setState(
      prevState => ({
        votes: { ...prevState.votes, [contestId]: vote },
      }),
      () => {
        this.setVotes(this.state.votes)
      }
    )
  }

  public resetBallot = (path: string = '/') => {
    this.resetVoterData()
    this.setState(
      {
        ...initialCardPresentState,
        ...initialUserState,
      },
      () => {
        this.setStoredState()
        this.props.history.push(path)
      }
    )
  }

  public activateBallot = ({
    ballotCreatedAt,
    ballotStyle,
    precinct,
  }: ActivationData) => {
    this.setBallotActivation({
      ballotCreatedAt,
      ballotStyleId: ballotStyle.id,
      precinctId: precinct.id,
    })
    this.setState(prevState => ({
      ballotCreatedAt,
      ballotStyleId: ballotStyle.id,
      contests: getContests({ ballotStyle, election: prevState.election! }),
      precinctId: precinct.id,
    }))
  }

  public setUserSettings = (partial: PartialUserSettings) => {
    this.setState(
      prevState => ({
        userSettings: { ...prevState.userSettings, ...partial },
      }),
      () => {
        const { textSize } = partial
        const isValidTextSize =
          'textSize' in partial &&
          typeof textSize === 'number' &&
          textSize >= 0 &&
          textSize <= GLOBALS.FONT_SIZES.length - 1
        /* istanbul ignore else */
        if (isValidTextSize) {
          this.setDocumentFontSize(textSize!)
        }
      }
    )
  }

  public setDocumentFontSize = (textSize: number = GLOBALS.TEXT_SIZE) => {
    document.documentElement.style.fontSize = `${GLOBALS.FONT_SIZES[textSize]}px`
  }

  public setAppMode = (event: InputEvent) => {
    const currentTarget = event.currentTarget as HTMLInputElement
    const appMode = getAppMode(currentTarget.dataset.appMode as AppModeNames)
    this.setState({ appMode }, this.setStoredState)
  }

  public toggleLiveMode = () => {
    this.setState(
      prevState => ({
        isLiveMode: !prevState.isLiveMode,
        ballotsPrintedCount: initialState.ballotsPrintedCount,
        isPollsOpen: initialState.isPollsOpen,
      }),
      this.setStoredState
    )
  }

  public togglePollsOpen = () => {
    this.setState(
      prevState => ({ isPollsOpen: !prevState.isPollsOpen }),
      this.setStoredState
    )
  }

  public incrementBallotsPrintedCount = () => {
    this.setState(
      prevState => ({
        ballotsPrintedCount: prevState.ballotsPrintedCount + 1,
      }),
      this.setStoredState
    )
  }

  public render() {
    const {
      appMode,
      ballotsPrintedCount,
      ballotStyleId,
      contests,
      election,
      isClerkCardPresent,
      isLiveMode,
      isPollsOpen,
      isPollWorkerCardPresent,
      isVoterCardPresent,
      isVoterCardExpired,
      isVoterCardUsed,
      isRecentVoterPrint,
      machineId,
      precinctId,
      userSettings,
      votes,
    } = this.state
    if (isClerkCardPresent) {
      return (
        <ClerkScreen
          appMode={appMode}
          ballotsPrintedCount={ballotsPrintedCount}
          election={election}
          fetchElection={this.fetchElection}
          isFetchingElection={this.state.isFetchingElection}
          isLiveMode={isLiveMode}
          setAppMode={this.setAppMode}
          toggleLiveMode={this.toggleLiveMode}
          unconfigure={this.unconfigure}
        />
      )
    } else if (election) {
      if (isPollWorkerCardPresent) {
        return (
          <PollWorkerScreen
            appMode={appMode}
            ballotsPrintedCount={ballotsPrintedCount}
            election={election}
            isLiveMode={isLiveMode}
            isPollsOpen={isPollsOpen}
            machineId={machineId}
            togglePollsOpen={this.togglePollsOpen}
          />
        )
      }
      if (isPollsOpen && isVoterCardPresent && isVoterCardUsed) {
        if (isRecentVoterPrint && appMode === VxMarkPlusVxPrint) {
          return <CastBallotPage />
        } else {
          return <UsedCardScreen />
        }
      }
      if (
        isPollsOpen &&
        isVoterCardExpired &&
        (isEmptyObject(votes) || appMode.isVxMark)
      ) {
        return <ExpiredCardScreen />
      }
      if (isPollsOpen && appMode === VxPrintOnly) {
        return (
          <PrintOnlyScreen
            ballotStyleId={ballotStyleId}
            election={election}
            isLiveMode={isLiveMode}
            isVoterCardPresent={isVoterCardPresent}
            markVoterCardUsed={this.markVoterCardUsed}
            precinctId={precinctId}
            printer={printer}
            votes={votes}
          />
        )
      }
      if (isPollsOpen && appMode.isVxMark) {
        if (isVoterCardPresent && ballotStyleId && precinctId) {
          return (
            <Gamepad onButtonDown={handleGamepadButtonDown}>
              <BallotContext.Provider
                value={{
                  activateBallot: this.activateBallot,
                  appMode,
                  ballotStyleId,
                  contests,
                  election,
                  incrementBallotsPrintedCount: this
                    .incrementBallotsPrintedCount,
                  isLiveMode,
                  markVoterCardUsed: this.markVoterCardUsed,
                  precinctId,
                  printer,
                  resetBallot: this.resetBallot,
                  setUserSettings: this.setUserSettings,
                  updateVote: this.updateVote,
                  userSettings,
                  votes,
                }}
              >
                <Ballot />
              </BallotContext.Provider>
            </Gamepad>
          )
        }
      }
      return (
        <InsertCardScreen
          election={election}
          isLiveMode={isLiveMode}
          isPollsOpen={isPollsOpen}
        />
      )
    } else {
      return <UnconfiguredScreen />
    }
  }
}

export default AppRoot
