import React, { useContext } from 'react'
import { Switch, Route, Redirect } from 'react-router-dom'
import { useLocation } from 'react-router-dom'

import { BallotScreenProps } from '../config/types'

import AppContext from '../contexts/AppContext'

import Screen from './Screen'
import Main from './Main'
import Navigation from './Navigation'
import ElectionEditDefinitionScreen from '../screens/ElectionEditDefinitionScreen'
import BallotListScreen from '../screens/BallotListScreen'
import BallotScreen from '../screens/BallotScreen'
import ExportElectionBallotPackageScreen from '../screens/ExportElectionBallotPackageScreen'
import LinkButton from './LinkButton'
import { Election } from '@votingworks/ballot-encoder'
import UnconfiguredScreen from '../screens/UnconfiguredScreen'

export const routerPaths = {
  root: '/',
  electionDefinition: '/definition',
  ballotsList: '/ballots',
  ballotsView: ({ ballotStyleId, precinctId }: BallotScreenProps) =>
    `/ballots/style/${ballotStyleId}/precinct/${precinctId}`,
  export: '/export',
}

const ElectionManager = () => {
  const location = useLocation()
  const isActiveSection = (path: string) =>
    new RegExp('^' + path).test(location.pathname) ? 'active-section' : ''
  const { election: e } = useContext(AppContext)
  const election = e as Election

  return (
    <Screen>
      <Main padded>
        {election ? (
          <Switch>
            <Route
              path={routerPaths.electionDefinition}
              component={ElectionEditDefinitionScreen}
            />
            <Route
              path={routerPaths.ballotsList}
              exact
              component={BallotListScreen}
            />
            <Route
              path={routerPaths.ballotsView({
                ballotStyleId: ':ballotStyleId',
                precinctId: ':precinctId',
              })}
              component={BallotScreen}
            />
            <Route
              path={routerPaths.export}
              component={ExportElectionBallotPackageScreen}
            />
            <Redirect to={routerPaths.ballotsList} />
          </Switch>
        ) : (
          <UnconfiguredScreen />
        )}
      </Main>
      <Navigation
        primaryNav={
          election && (
            <React.Fragment>
              <LinkButton
                to={routerPaths.electionDefinition}
                className={isActiveSection(routerPaths.electionDefinition)}
              >
                Definition
              </LinkButton>
              <LinkButton
                to={routerPaths.ballotsList}
                className={isActiveSection(routerPaths.ballotsList)}
              >
                Ballots
              </LinkButton>
            </React.Fragment>
          )
        }
      />
    </Screen>
  )
}

export default ElectionManager