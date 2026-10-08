import { describe, expect, it } from 'vitest'
import { changeMarkers, formatChangePrice, movementTone, priceMovement } from './change-presentation'
const row={ beforePresent:true,afterPresent:true,beforePrice:'100',afterPrice:'80',beforeCurrency:'USD',afterCurrency:'USD',delta:'-20',percent:'-20' }
describe('price change explanations',()=>{
  it('uses semantic tones and keeps overlapping event meanings visible without redundant price labels',()=>{
    expect(movementTone({kinds:['price_drop']})).toBe('text-change-drop')
    expect(movementTone({kinds:['price_increase']})).toBe('text-change-increase')
    expect(movementTone({kinds:['missing']})).toBe('text-change-removed')
    expect(changeMarkers(['price_changed','price_drop','stock_changed'])).toBe('📉 Price drop · 📦 Stock changed')
    expect(changeMarkers(['new'])).toBe('✨ New listing')
  })
  it('formats prices and explains direction and percentage',()=>{
    expect(formatChangePrice('80',null)).toBe('$80.00 USD')
    expect(priceMovement(row)).toEqual({label:'↓ Down $20.00 USD',detail:'20.00% lower'})
    expect(priceMovement({...row,delta:'20',percent:'20'}).detail).toBe('20.00% higher')
  })
  it('distinguishes first capture, removal, return, unchanged price, and currency changes',()=>{
    expect(priceMovement({...row,beforePresent:null}).label).toBe('First recorded appearance')
    expect(priceMovement({...row,afterPresent:false}).label).toBe('Removed from source')
    expect(priceMovement({...row,beforePresent:false}).label).toBe('Returned to source')
    expect(priceMovement({...row,delta:'0',percent:'0'}).label).toBe('Price unchanged')
    expect(priceMovement({...row,afterCurrency:'EUR'}).label).toBe('Currency changed')
  })
})
