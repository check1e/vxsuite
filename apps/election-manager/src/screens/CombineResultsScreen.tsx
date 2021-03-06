import React, { useState } from 'react'
import fileDownload from 'js-file-download'
import styled from 'styled-components'

import ConverterClient from '../lib/ConverterClient'
import { copyFile } from '../utils/file'

import { InputEventFunction } from '../config/types'

import Button from '../components/Button'
import LinkButton from '../components/LinkButton'
import routerPaths from '../routerPaths'
import FileInputButton from '../components/FileInputButton'
import HorizontalRule from '../components/HorizontalRule'
import Prose from '../components/Prose'
import Loading from '../components/Loading'
import NavigationScreen from '../components/NavigationScreen'

const Loaded = styled.p`
  line-height: 2.5rem;
  color: rgb(0, 128, 0);
  &::before {
    content: '✓ ';
  }
`

const CombineResultsScreen: React.FC = () => {
  const client = new ConverterClient('election')
  const [resultsOneFile, setResultsOneFile] = useState<File | undefined>(
    undefined
  )
  const [resultsTwoFile, setResultsTwoFile] = useState<File | undefined>(
    undefined
  )
  const [isCombining, setIsCombining] = useState(false)

  const handleFirstFileInput: InputEventFunction = async (event) => {
    const input = event.currentTarget
    const file = input.files && input.files[0]
    if (file) {
      setResultsOneFile(await copyFile(file))
    }
  }

  const handleSecondFileInput: InputEventFunction = async (event) => {
    const input = event.currentTarget
    const file = input.files && input.files[0]
    if (file) {
      setResultsTwoFile(await copyFile(file))
    }
  }

  const reset = () => {
    setResultsOneFile(undefined)
    setResultsTwoFile(undefined)
  }

  const combine = async () => {
    setIsCombining(true)
    try {
      const results = await client.combineResultsFiles(
        resultsOneFile!,
        resultsTwoFile!
      )
      fileDownload(results, 'combined-results.csv', 'text/csv')
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert(`there was an error combining results files: ${e.toString()}`)
    }
    setIsCombining(false)
  }

  if (isCombining) {
    return (
      <NavigationScreen>
        <Loading isFullscreen />
      </NavigationScreen>
    )
  }

  return (
    <NavigationScreen mainChildCenter>
      <Prose textCenter>
        <h1>Combine Results Files</h1>
        <p> Select two results files to combine:</p>
        {resultsOneFile ? (
          <Loaded key="one">{`Loaded ${resultsOneFile.name}`}</Loaded>
        ) : (
          <FileInputButton
            accept="*"
            buttonProps={{
              fullWidth: true,
            }}
            name="Results File #1"
            onChange={handleFirstFileInput}
          >
            Results File #1
          </FileInputButton>
        )}
        <HorizontalRule />
        {resultsTwoFile ? (
          <Loaded key="two">{`Loaded ${resultsTwoFile.name}`}</Loaded>
        ) : (
          <FileInputButton
            accept="*"
            buttonProps={{
              fullWidth: true,
            }}
            name="Results File #2"
            onChange={handleSecondFileInput}
          >
            Results File #2
          </FileInputButton>
        )}
        <HorizontalRule />
        <Button disabled={!(resultsOneFile || resultsTwoFile)} onPress={reset}>
          Reset
        </Button>
        <HorizontalRule />
        <Button
          primary
          disabled={!(resultsOneFile && resultsTwoFile)}
          onPress={combine}
        >
          Combine
        </Button>
        <HorizontalRule />
        <LinkButton small to={routerPaths.tally}>
          Back to Tally
        </LinkButton>
      </Prose>
    </NavigationScreen>
  )
}

export default CombineResultsScreen
