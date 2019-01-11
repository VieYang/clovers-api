const debug = require('debug')('app:models:simpleCloversMarket')
import r from 'rethinkdb'
import utils from 'web3-utils'
import BigNumber from 'bignumber.js'
import { padBigNum, dodb } from '../lib/util'
let db, io
// event updatePrice(uint256 _tokenId, uint256 price); // NOTE: lowercase u
export let simpleCloversMarketupdatePrice = async function({
  log,
  io: _io,
  db: _db
}) {
  db = _db
  io = _io

  debug(log.name + ' called')
  let _tokenId = log.data._tokenId
  await changeCloverPrice(db, io, _tokenId, log)
}

export let simpleCloversMarketOwnershipTransferred = async function({
  log,
  io,
  db
}) {
  debug(log.name + ' does not affect the database')
}

export async function changeCloverPrice(db, io, _tokenId, log) {
  let price = log.data.price
  debug(price)
  if (Array.isArray(price)) {
    price = price[0]
  }
  price = typeof price == 'object' ? price : new BigNumber(price)

  let command = r
    .db('clovers_v2')
    .table('clovers')
    .get(_tokenId)
  let clover = await dodb(db, command)
  debug(price)
  if (price.eq(0)) {
    debug('removed from market or sold (set to 0)')
  }
  clover.price = padBigNum(price)
  clover.modified = log.blockNumber
  command = r
    .db('clovers_v2')
    .table('clovers')
    .insert(clover, { conflict: 'update' })
  await dodb(db, command)

  // get clover again, with comments and orders
  r.db('clovers_v2')
    .table('clovers')
    .get(_tokenId)
    .do((doc) => {
      return doc.merge({
        commentCount: r.db('clovers_v2')
          .table('chats')
          .getAll(doc('board'), { index: 'board' })
          .count(),
        lastOrder: r.db('clovers_v2')
          .table('orders')
          .getAll(doc('board'), { index: 'market' })
          .orderBy(r.desc('created'), r.desc('transactionIndex'))
          .limit(1)
          .fold(false, (l, r) => r)
      })
    })
    .run(db, (err, result) => {
      io && io.emit('updateClover', result)
      debug(io ? 'emit updateClover' : 'do not emit updateClover')
    })
}
