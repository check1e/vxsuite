import { createCanvas } from 'canvas'
import { promises as fs } from 'fs'
import { Rect } from '../src/types'

export async function writeImageToFile(
  imageData: ImageData,
  filePath: string,
  bounds?: Rect
): Promise<void> {
  const canvas = createCanvas(
    bounds?.width ?? imageData.width,
    bounds?.height ?? imageData.height
  )
  const context = canvas.getContext('2d')
  context.putImageData(imageData, -(bounds?.x ?? 0), -(bounds?.y ?? 0))
  await fs.writeFile(filePath, canvas.toBuffer())
}