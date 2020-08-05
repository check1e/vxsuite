import {
  Candidate,
  CandidateContest,
  VotesDict,
  YesNoContest,
  YesNoVote,
} from '@votingworks/ballot-encoder'
import { inspect } from 'util'

export function addVote(
  votes: VotesDict,
  contest: CandidateContest,
  candidate: Candidate
): void
export function addVote(
  votes: VotesDict,
  contest: YesNoContest,
  yesNo: 'yes' | 'no'
): void
export function addVote(
  votes: VotesDict,
  contest: CandidateContest | YesNoContest,
  candidateOrYesNo: Candidate | 'yes' | 'no'
): void {
  if (contest.type === 'candidate' && typeof candidateOrYesNo === 'object') {
    const contestVotes = (votes[contest.id] ?? []) as Candidate[]
    contestVotes.push(candidateOrYesNo)
    votes[contest.id] = contestVotes
  } else if (contest.type === 'yesno' && typeof candidateOrYesNo === 'string') {
    const contestVotes = (votes[contest.id] ?? []) as ('yes' | 'no')[]
    contestVotes.push(candidateOrYesNo)
    votes[contest.id] = contestVotes as YesNoVote
  } else {
    throw new Error(
      `Invalid vote for '${contest.type}' contest type: ${inspect(
        candidateOrYesNo
      )}`
    )
  }
}