import {
  Party,
  YesNoVote,
  Candidate,
  CandidateContest,
  CandidateVote,
  Election,
  VotesDict,
} from '@votingworks/ballot-encoder'
import {
  ContestOption,
  ContestOptionTally,
  Dictionary,
  FullElectionTally,
  VotesByFilter,
  CastVoteRecord,
  VotesByFunction,
  Tally,
  ContestTally,
  YesNoContestOptionTally,
} from '../config/types'

import find from '../utils/find'

// the generic write-in candidate to keep count
const writeInCandidate: Candidate = {
  id: 'writein',
  name: 'Write-In',
  isWriteIn: true,
}

// CVRs are newline-separated JSON objects
export const parseCVRs = (castVoteRecordsString: string) =>
  castVoteRecordsString
    .split('\n')
    .filter((el) => el) // remove empty lines
    .map((line) => JSON.parse(line) as CastVoteRecord)

export const getVotesByPrecinct: VotesByFunction = ({
  election,
  castVoteRecords,
}) => {
  const votesByPrecinct: VotesByFilter = {}
  castVoteRecords.forEach((CVR) => {
    const vote: VotesDict = {}
    election.contests.forEach((contest) => {
      if (!CVR[contest.id]) {
        return
      }

      if (contest.type === 'yesno') {
        // the CVR is encoded the same way
        vote[contest.id] = CVR[contest.id] as YesNoVote
        return
      }

      if (contest.type === 'candidate') {
        vote[contest.id] = (CVR[contest.id] as string[]).map((candidateId) =>
          find(
            [writeInCandidate, ...contest.candidates],
            (c) => c.id === candidateId
          )
        )
      }
    })

    let votes = votesByPrecinct[CVR._precinctId]
    if (!votes) {
      votesByPrecinct[CVR._precinctId] = votes = []
    }

    votes.push(vote)
  })

  return votesByPrecinct
}

export const getVotesByScanner: VotesByFunction = ({
  election,
  castVoteRecords,
}) => {
  const votesByScanner: VotesByFilter = {}
  castVoteRecords.forEach((CVR) => {
    const vote: VotesDict = {}
    election.contests.forEach((contest) => {
      if (!CVR[contest.id]) {
        return
      }

      if (contest.type === 'yesno') {
        // the CVR is encoded the same way
        vote[contest.id] = CVR[contest.id] as YesNoVote
        return
      }

      if (contest.type === 'candidate') {
        vote[contest.id] = (CVR[contest.id] as string[]).map((candidateId) =>
          find(
            [writeInCandidate, ...contest.candidates],
            (c) => c.id === candidateId
          )
        )
      }
    })

    let votes = votesByScanner[CVR._scannerId]
    if (!votes) {
      votesByScanner[CVR._scannerId] = votes = []
    }

    votes.push(vote)
  })

  return votesByScanner
}

interface TallyParams {
  election: Election
  precinctId?: string
  scannerId?: string
  votes: VotesDict[]
}

export function tallyVotesByContest({
  election,
  votes,
}: TallyParams): ContestTally[] {
  const contestTallies: ContestTally[] = []

  election.contests.forEach((contest) => {
    let options: ContestOption[]
    if (contest.type === 'yesno') {
      options = [['yes'], ['no']]
    } else {
      options = contest.candidates
    }

    const tallies: ContestOptionTally[] = options
      .map((option) => {
        return { option, tally: 0 }
      })
      .concat(
        contest.type === 'candidate' && contest.allowWriteIns
          ? [{ option: writeInCandidate, tally: 0 }]
          : []
      )

    votes.forEach((vote) => {
      const selected = vote[contest.id]
      if (!selected) {
        return
      }

      // overvotes & undervotes
      const seats =
        contest.type === 'yesno' ? 1 : (contest as CandidateContest).seats
      if (selected.length > seats || selected.length === 0) {
        return
      }

      if (contest.type === 'yesno') {
        const optionTally = find(tallies, (optionTally) => {
          return (
            (optionTally as YesNoContestOptionTally).option[0] === selected[0]
          )
        })
        optionTally.tally += 1
      } else {
        ;(selected as CandidateVote).forEach((selectedOption) => {
          const optionTally = find(tallies, (optionTally) => {
            const candidateOption = optionTally.option as Candidate
            const selectedCandidateOption = selectedOption as Candidate
            return candidateOption.id === selectedCandidateOption.id
          })
          optionTally.tally += 1
        })
      }
    })

    contestTallies.push({ contest, tallies, ballotsCastWithContest: 1 })
  })

  return contestTallies
}

interface FilterTalliesByPartyParams {
  election: Election
  electionTally: Tally
  party?: Party
}

// TODO: How to use type of electionTally as the return type
export function filterTalliesByParty({
  election,
  electionTally,
  party,
}: FilterTalliesByPartyParams) {
  if (!party) {
    return electionTally
  }

  const districts = election.ballotStyles
    .filter((bs) => bs.partyId === party.id)
    .flatMap((bs) => bs.districts)
  const contestIds = election.contests
    .filter(
      (contest) =>
        districts.includes(contest.districtId) && contest.partyId === party.id
    )
    .map((contest) => contest.id)

  return {
    ...electionTally,
    contestTallies: electionTally.contestTallies.filter((contestTally) =>
      contestIds.includes(contestTally.contest.id)
    ),
  }
}

interface FullTallyParams {
  election: Election
  castVoteRecords: CastVoteRecord[]
}

export function fullTallyVotes({
  election,
  castVoteRecords,
}: FullTallyParams): FullElectionTally {
  const votesByPrecinct = getVotesByPrecinct({
    election,
    castVoteRecords,
  })
  const votesByScanner = getVotesByScanner({
    election,
    castVoteRecords,
  })

  const scannerTallies: Dictionary<Tally> = {}
  const precinctTallies: Dictionary<Tally> = {}

  let allVotes: VotesDict[] = []

  for (const precinctId in votesByPrecinct) {
    const votes = votesByPrecinct[precinctId]!
    precinctTallies[precinctId] = {
      precinctId,
      contestTallies: tallyVotesByContest({
        election,
        votes,
      }),
    }
    allVotes = [...allVotes, ...votes]
  }
  for (const scannerId in votesByScanner) {
    const votes = votesByScanner[scannerId]!
    scannerTallies[scannerId] = {
      scannerId,
      contestTallies: tallyVotesByContest({
        election,
        votes,
      }),
    }
  }

  const overallTally = tallyVotesByContest({ election, votes: allVotes })

  return {
    scannerTallies,
    precinctTallies,
    overallTally: {
      contestTallies: overallTally,
    },
  }
}

export interface ContestTallyMeta {
  overvotes: number
  undervotes: number
  ballots: number
}

export const getContestTallyMeta = ({
  election,
  castVoteRecords,
}: FullTallyParams) =>
  election.contests.reduce<Dictionary<ContestTallyMeta>>(
    (dictionary, contest) => {
      const contestCVRs = castVoteRecords.filter(
        (cvr) => cvr[contest.id] !== undefined
      )
      const contestVotes = contestCVRs.map((cvr) => cvr[contest.id])
      const overvotes = contestVotes.filter((vote) => {
        if (contest.type === 'yesno') {
          return (vote as YesNoVote).length > 1
        }
        if (contest.type === 'candidate') {
          return ((vote as unknown) as CandidateVote).length > contest.seats
        }
        return false
      })
      const undervotes = contestVotes.filter((vote) => {
        if (contest.type === 'yesno') {
          return (vote as YesNoVote).length === 0
        }
        if (contest.type === 'candidate') {
          return ((vote as unknown) as CandidateVote).length < contest.seats
        }
        return false
      })
      dictionary[contest.id] = {
        ballots: contestCVRs.length,
        overvotes: overvotes.length,
        undervotes: undervotes.length,
      }
      return dictionary
    },
    {}
  )