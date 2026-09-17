import { describe, expect, it } from 'vitest'
import { imagePreviewPosition } from './image-preview-position'

describe('listing image hover position', () => {
  it('appears beside the pointer when space allows', () => {
    expect(imagePreviewPosition(100, 100, 1200, 800)).toEqual({ left: 116, top: 116 })
  })

  it('flips left and above near viewport edges', () => {
    expect(imagePreviewPosition(1100, 700, 1200, 800)).toEqual({ left: 828, top: 428 })
  })

  it('stays inside the top and left edges on a small viewport', () => {
    expect(imagePreviewPosition(10, 10, 220, 220)).toEqual({ left: 8, top: 8 })
  })
})
