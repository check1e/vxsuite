import {
  BallotType,
  CompletedBallot,
  Contests,
  Election,
  getBallotStyle,
  getContests,
  getPrecinctById,
} from '@votingworks/ballot-encoder'
import { strict as assert } from 'assert'
import makeDebug from 'debug'
import * as jsfeat from 'jsfeat'
import { v4 as uuid } from 'uuid'
import getVotesFromMarks from './getVotesFromMarks'
import findContestOptions from './hmpb/findContestOptions'
import findContests from './hmpb/findContests'
import findTargets, { TargetShape } from './hmpb/findTargets'
import { detect } from './metadata'
import {
  BallotCandidateTargetMark,
  BallotLocales,
  BallotMark,
  BallotPageLayout,
  BallotPageMetadata,
  BallotYesNoTargetMark,
  DetectQRCode,
  FindMarksResult,
  Interpreted,
  PartialTemplateSpecifier,
  Point,
  Size,
} from './types'
import { binarize, PIXEL_BLACK, PIXEL_WHITE } from './utils/binarize'
import crop from './utils/crop'
import defined from './utils/defined'
import { vh as flipVH } from './utils/flip'
import { rectCorners } from './utils/geometry'
import { map, reversed, zip, zipMin } from './utils/iterators'
import diff, { countPixels } from './utils/jsfeat/diff'
import matToImageData from './utils/jsfeat/matToImageData'
import readGrayscaleImage from './utils/jsfeat/readGrayscaleImage'
import KeyedMap from './utils/KeyedMap'
import outline from './utils/outline'

const debug = makeDebug('hmpb-interpreter:Interpreter')

export interface Options {
  readonly election: Election
  readonly detectQRCode?: DetectQRCode
  readonly markScoreVoteThreshold?: number
  readonly testMode?: boolean

  /** @deprecated */
  decodeQRCode?: DetectQRCode
}

export const DEFAULT_MARK_SCORE_VOTE_THRESHOLD = 0.2

type TemplateKey = Omit<BallotPageMetadata, 'isTestBallot' | 'pageCount'>

/**
 * Interprets ballot images based on templates. A template is simply an empty
 * ballot and should be exactly what is given to a voter for them to mark.
 *
 * @example
 *
 * ```ts
 * const interpreter = new Interpreter(election)
 * await interpreter.addTemplate(templatePage1)
 * await interpreter.addTemplate(templatePage2)
 * console.log(await interpreter.interpretBallot(ballotPage1))
 * ```
 */
export default class Interpreter {
  private templates = new KeyedMap<
    [
      BallotLocales | undefined,
      BallotPageMetadata['ballotStyleId'],
      BallotPageMetadata['precinctId'],
      number
    ],
    BallotPageLayout | undefined
  >(([locales, ballotStyleId, precinctId, pageNumber]) =>
    [
      locales?.primary,
      locales?.secondary,
      ballotStyleId,
      precinctId,
      pageNumber,
    ].join('-')
  )
  private readonly election: Election
  private readonly testMode: boolean
  private readonly detectQRCode?: DetectQRCode
  private readonly markScoreVoteThreshold: number

  public constructor(election: Election)
  public constructor(options: Options)
  public constructor(optionsOrElection: Options | Election) {
    if ('election' in optionsOrElection) {
      this.election = optionsOrElection.election
      this.detectQRCode =
        optionsOrElection.detectQRCode ?? optionsOrElection.decodeQRCode
      this.markScoreVoteThreshold =
        optionsOrElection.markScoreVoteThreshold ??
        DEFAULT_MARK_SCORE_VOTE_THRESHOLD
      this.testMode = optionsOrElection.testMode ?? false
    } else {
      this.election = optionsOrElection
      this.markScoreVoteThreshold = DEFAULT_MARK_SCORE_VOTE_THRESHOLD
      this.testMode = false
    }
  }

  /**
   * Adds a template so that this `Interpreter` will be able to scan ballots
   * printed from it. The template image should be an image of a blank ballot,
   * either scanned or otherwise rendered as an image.
   */
  public async addTemplate(
    imageData: ImageData,
    metadata?: BallotPageMetadata,
    { flipped }?: { flipped?: boolean }
  ): Promise<BallotPageLayout>
  public async addTemplate(
    template: BallotPageLayout
  ): Promise<BallotPageLayout>
  public async addTemplate(
    imageDataOrTemplate: ImageData | BallotPageLayout,
    metadata?: BallotPageMetadata,
    { flipped }: { flipped?: boolean } = {}
  ): Promise<BallotPageLayout> {
    const template =
      'data' in imageDataOrTemplate
        ? await this.interpretTemplate(imageDataOrTemplate, metadata, {
            flipped,
          })
        : imageDataOrTemplate
    if (!metadata) {
      metadata = template.ballotImage.metadata
    }

    if (metadata.isTestBallot !== this.testMode) {
      throw new Error(
        `interpreter configured with testMode=${this.testMode} cannot add templates with isTestBallot=${metadata.isTestBallot}`
      )
    }

    this.setTemplate(metadata, template)
    return template
  }

  /**
   * Gets a template by ballot style, precinct, and page number if present.
   */
  private getTemplate({
    locales,
    ballotStyleId,
    precinctId,
    pageNumber,
  }: TemplateKey): BallotPageLayout | undefined {
    return this.templates.get([locales, ballotStyleId, precinctId, pageNumber])
  }

  /**
   * Sets a template by ballot style, precinct, and page number.
   */
  private setTemplate(
    { locales, ballotStyleId, precinctId, pageNumber }: TemplateKey,
    template: BallotPageLayout
  ): void {
    this.templates.set(
      [locales, ballotStyleId, precinctId, pageNumber],
      template
    )
  }

  /**
   * Interprets an image as a template, returning the layout information read
   * from the image. The template image should be an image of a blank ballot,
   * either scanned or otherwise rendered as an image.
   */
  public async interpretTemplate(
    imageData: ImageData,
    metadata?: BallotPageMetadata,
    { flipped = false } = {}
  ): Promise<BallotPageLayout> {
    debug(
      'interpretTemplate: looking for contests in %d×%d image',
      imageData.width,
      imageData.height
    )
    ;({ imageData, metadata } = await this.normalizeImageDataAndMetadata(
      imageData,
      metadata,
      {
        flipped,
      }
    ))

    debug('using metadata for template: %O', metadata)

    const contests = findContestOptions([
      ...map(findContests(imageData), ({ bounds, corners }) => ({
        bounds,
        corners,
        targets: [...reversed(findTargets(imageData, bounds))],
      })),
    ])

    return {
      ballotImage: { imageData, metadata },
      contests,
    }
  }

  /**
   * Determines whether enough of the template images have been added to allow
   * scanning a ballot with the given metadata.
   */
  public canScanBallot(metadata: BallotPageMetadata): boolean {
    debug('canScanBallot metadata=%O', metadata)

    for (
      let pageNumber = 1;
      pageNumber <= metadata.pageNumber;
      pageNumber += 1
    ) {
      const pageTemplate = this.getTemplate({ ...metadata, pageNumber })
      if (!pageTemplate) {
        debug(
          'cannot scan ballot because template page %d of %d is missing',
          pageNumber,
          metadata.pageCount
        )
        return false
      }

      if (
        pageNumber === metadata.pageNumber &&
        pageTemplate.ballotImage.metadata.isTestBallot !== metadata.isTestBallot
      ) {
        debug(
          'cannot scan ballot because template page %d of %d does not match the expected test ballot value (%s)',
          pageNumber,
          metadata.pageCount,
          metadata.isTestBallot
        )
        return false
      }
    }

    return true
  }

  /**
   * Gets information about missing templates. As more templates are added to
   * fill in the gaps, the resulting specifier will become more specific.
   */
  public *getMissingTemplates(
    ballotLocaleConfigs: readonly (BallotLocales | undefined)[] = [undefined]
  ): Generator<PartialTemplateSpecifier> {
    for (const locales of ballotLocaleConfigs) {
      for (const ballotStyle of this.election.ballotStyles) {
        for (const precinctId of ballotStyle.precincts) {
          const templatePage1 = this.getTemplate({
            locales,
            ballotStyleId: ballotStyle.id,
            precinctId,
            pageNumber: 1,
          })

          if (templatePage1) {
            for (
              let pageNumber = 2;
              pageNumber <= templatePage1.ballotImage.metadata.pageCount;
              pageNumber += 1
            ) {
              if (
                !this.getTemplate({
                  locales,
                  ballotStyleId: ballotStyle.id,
                  precinctId,
                  pageNumber,
                })
              ) {
                yield {
                  ballotStyleId: ballotStyle.id,
                  precinctId,
                  pageNumber,
                }
              }
            }
          } else {
            yield {
              ballotStyleId: ballotStyle.id,
              precinctId,
            }
          }
        }
      }
    }

    return false
  }

  /**
   * Determines whether there are any templates missing, i.e. the existing
   * templates do not account for all contests in all ballot styles.
   */
  public hasMissingTemplates(): boolean {
    return !this.getMissingTemplates().next().done
  }

  /**
   * Interprets an image as a ballot, returning information about the votes cast.
   */
  public async interpretBallot(
    imageData: ImageData,
    metadata?: BallotPageMetadata,
    { flipped = false } = {}
  ): Promise<Interpreted> {
    ;({ imageData, metadata } = await this.normalizeImageDataAndMetadata(
      imageData,
      metadata,
      {
        flipped,
      }
    ))

    if (metadata.isTestBallot !== this.testMode) {
      throw new Error(
        `interpreter configured with testMode=${this.testMode} cannot interpret ballots with isTestBallot=${metadata.isTestBallot}`
      )
    }

    debug('using metadata: %O', metadata)
    const marked = await this.findMarks(imageData, metadata)
    const ballot = this.interpretMarks(marked)
    return { ...marked, ballot }
  }

  private async findMarks(
    imageData: ImageData,
    metadata: BallotPageMetadata
  ): Promise<FindMarksResult> {
    debug('looking for marks in %d×%d image', imageData.width, imageData.height)

    if (!this.canScanBallot(metadata)) {
      throw new Error(
        'Cannot scan ballot because not all required templates have been added'
      )
    }

    const contests = findContests(imageData)
    const ballotLayout: BallotPageLayout = {
      ballotImage: { imageData, metadata },
      contests: [
        ...map(contests, ({ bounds, corners }) => ({
          bounds,
          corners,
          options: [],
        })),
      ],
    }
    debug(
      'found contest areas: %O',
      ballotLayout.contests.map(({ bounds }) => bounds)
    )

    const { locales, ballotStyleId, precinctId, pageNumber } = metadata
    const matchedTemplate = defined(
      this.getTemplate({ locales, ballotStyleId, precinctId, pageNumber })
    )
    const [mappedBallot, marks] = this.getMarksForBallot(
      ballotLayout,
      matchedTemplate,
      this.getContestsForTemplate(matchedTemplate)
    )

    return { matchedTemplate, mappedBallot, metadata, marks }
  }

  /**
   * Get the contests for the given template.
   */
  private getContestsForTemplate(template: BallotPageLayout): Contests {
    const { election } = this
    const {
      locales,
      ballotStyleId,
      pageNumber,
      precinctId,
    } = template.ballotImage.metadata
    const ballotStyle = defined(
      getBallotStyle({
        ballotStyleId,
        election,
      })
    )

    let contestOffset = 0
    for (let i = 1; i < pageNumber; i += 1) {
      const pageTemplate = defined(
        this.getTemplate({ locales, ballotStyleId, precinctId, pageNumber: i })
      )
      contestOffset += pageTemplate.contests.length
    }

    return getContests({ ballotStyle, election }).slice(
      contestOffset,
      contestOffset + template.contests.length
    )
  }

  private interpretMarks({
    marks,
    metadata,
  }: FindMarksResult): CompletedBallot {
    const { election } = this
    const ballotStyle = defined(
      getBallotStyle({
        ballotStyleId: metadata.ballotStyleId,
        election,
      })
    )
    const precinct = defined(
      getPrecinctById({
        election,
        precinctId: metadata.precinctId,
      })
    )
    return {
      ballotId: uuid(),
      ballotStyle,
      ballotType: BallotType.Standard,
      election,
      isTestBallot: metadata.isTestBallot,
      precinct,
      votes: getVotesFromMarks(marks, {
        markScoreVoteThreshold: this.markScoreVoteThreshold,
      }),
    }
  }

  private async normalizeImageDataAndMetadata(
    imageData: ImageData,
    metadata?: BallotPageMetadata,
    { flipped = false } = {}
  ): Promise<{ imageData: ImageData; metadata: BallotPageMetadata }> {
    binarize(imageData)

    if (metadata) {
      if (flipped) {
        flipVH(imageData)
      }
    } else {
      const detectResult = await detect(imageData, {
        detectQRCode: this.detectQRCode,
      })
      metadata = detectResult.metadata
      if (detectResult.flipped) {
        debug('detected image is flipped, correcting orientation')
        flipVH(imageData)
      }
    }

    return { imageData, metadata }
  }

  private getMarksForBallot(
    ballotLayout: BallotPageLayout,
    template: BallotPageLayout,
    contests: Contests
  ): [ImageData, BallotMark[]] {
    assert.equal(
      template.contests.length,
      contests.length,
      `template and election definition have different numbers of contests (${template.contests.length} vs ${contests.length}); maybe the template is from an old version of the election definition?`
    )

    assert.equal(
      ballotLayout.contests.length,
      contests.length,
      `ballot and election definition have different numbers of contests (${ballotLayout.contests.length} vs ${contests.length}); maybe the ballot is from an old version of the election definition?`
    )

    const mappedBallot = this.mapBallotOntoTemplate(ballotLayout, template)
    const marks: BallotMark[] = []

    for (const [{ options }, contest] of zip(template.contests, contests)) {
      debug(`getting marks for %s contest '%s'`, contest.type, contest.id)

      if (contest.type === 'candidate') {
        const expectedOptions =
          contest.candidates.length +
          (contest.allowWriteIns ? contest.seats : 0)

        if (options.length !== expectedOptions) {
          throw new Error(
            `Contest ${contest.id} is supposed to have ${expectedOptions} options(s), but found ${options.length}.`
          )
        }

        for (const [option, candidate] of zipMin(options, contest.candidates)) {
          const score = this.targetMarkScore(
            template.ballotImage.imageData,
            mappedBallot,
            option.target
          )
          debug(
            `candidate '%s' target filled in with score %d`,
            candidate.name,
            score
          )
          const mark: BallotCandidateTargetMark = {
            type: 'candidate',
            bounds: option.target.bounds,
            contest,
            score,
            target: option.target,
            option: candidate,
          }
          marks.push(mark)
        }

        if (contest.allowWriteIns) {
          const writeInOptions = options.slice(contest.candidates.length)

          for (const [
            writeInIndex,
            writeInOption,
          ] of writeInOptions.entries()) {
            const score = this.targetMarkScore(
              template.ballotImage.imageData,
              mappedBallot,
              writeInOption.target
            )
            const mark: BallotCandidateTargetMark = {
              type: 'candidate',
              bounds: writeInOption.target.bounds,
              contest,
              score,
              target: writeInOption.target,
              option: {
                id: `__write-in-${writeInIndex}`,
                name: 'Write-In',
                isWriteIn: true,
              },
            }
            marks.push(mark)
          }
        }
      } else {
        if (options.length !== 2) {
          throw new Error(
            `Contest ${contest.id} is supposed to have two options (yes/no), but found ${options.length}.`
          )
        }

        const [yesOption, noOption] = options
        const yesScore = this.targetMarkScore(
          template.ballotImage.imageData,
          mappedBallot,
          yesOption.target
        )
        debug(`'yes' mark score: %d`, yesScore)
        const yesMark: BallotYesNoTargetMark = {
          type: 'yesno',
          bounds: yesOption.target.bounds,
          contest,
          option: 'yes',
          score: yesScore,
          target: yesOption.target,
        }
        marks.push(yesMark)

        const noScore = this.targetMarkScore(
          template.ballotImage.imageData,
          mappedBallot,
          noOption.target
        )
        debug(`'no' mark score: %d`, noScore)
        const noMark: BallotYesNoTargetMark = {
          type: 'yesno',
          bounds: noOption.target.bounds,
          contest,
          option: 'no',
          score: noScore,
          target: noOption.target,
        }
        marks.push(noMark)
      }
    }

    return [mappedBallot, marks]
  }

  private targetMarkScore(
    template: ImageData,
    ballot: ImageData,
    target: TargetShape
  ): number {
    const offsetAndScore = new Map<Point, number>()
    const templateTarget = outline(crop(template, target.bounds))
    const templateTargetInner = outline(crop(template, target.inner))
    const templatePixelCountAvailableToFill = countPixels(templateTargetInner, {
      color: PIXEL_WHITE,
    })

    for (const { x, y } of [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ]) {
      const offsetTargetInner = {
        ...target.inner,
        x: target.inner.x + x,
        y: target.inner.y + y,
      }
      const diffImageInner = diff(
        templateTarget,
        ballot,
        {
          ...target.inner,
          x: target.inner.x - target.bounds.x,
          y: target.inner.y - target.bounds.y,
        },
        offsetTargetInner
      )
      const ballotTargetInnerNewBlackPixelCount = countPixels(diffImageInner, {
        color: PIXEL_BLACK,
      })
      offsetAndScore.set(
        { x, y },
        ballotTargetInnerNewBlackPixelCount / templatePixelCountAvailableToFill
      )
    }
    const [[, minScore]] = [...offsetAndScore].sort(([, a], [, b]) => a - b)
    return minScore
  }

  private mapImageWithPoints(
    imageMat: jsfeat.matrix_t,
    mappedSize: Size,
    fromPoints: Point[],
    toPoints: Point[]
  ): ImageData {
    const homography = new jsfeat.motion_model.homography2d()
    const transform = new jsfeat.matrix_t(3, 3, jsfeat.F32_t | jsfeat.C1_t)

    homography.run(toPoints, fromPoints, transform, toPoints.length)

    const mappedImage = new jsfeat.matrix_t(
      mappedSize.width,
      mappedSize.height,
      jsfeat.U8C1_t
    )
    jsfeat.imgproc.warp_perspective(imageMat, mappedImage, transform, 255)

    return matToImageData(mappedImage)
  }

  private mapBallotOntoTemplate(
    ballot: BallotPageLayout,
    template: BallotPageLayout
  ): ImageData {
    const ballotMat = readGrayscaleImage(ballot.ballotImage.imageData)
    const templateSize = {
      width: template.ballotImage.imageData.width,
      height: template.ballotImage.imageData.height,
    }
    const ballotPoints: Point[] = []
    const templatePoints: Point[] = []

    for (const [
      { bounds: ballotContestBounds },
      { bounds: templateContestBounds },
    ] of zip(ballot.contests, template.contests)) {
      ballotPoints.push(...rectCorners(ballotContestBounds))
      templatePoints.push(...rectCorners(templateContestBounds))
    }

    return this.mapImageWithPoints(
      ballotMat,
      templateSize,
      ballotPoints,
      templatePoints
    )
  }
}