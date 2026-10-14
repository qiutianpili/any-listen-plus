/**
 * @name 我的账号音源
 * @description 用你自己扫码登录的网易云/QQ/酷狗账号取播放链接（在 /al-login/ 登录）
 * @version 1.0.0
 * @author any-listen-plus
 */
// Installed per Any Listen user by install.py; __TOKEN__ is that user's private random token, so this
// script can only ever use the logins of the user whose AL instance it lives in.
const TOKEN = '__TOKEN__'
const API = '__API__'
const { EVENT_NAMES, request, on, send } = globalThis.lx
const QUALITYS = ['128k', '320k', 'flac', 'flac24bit']

const fail = (msg) => Promise.reject(new Error('[nocool] ' + msg))

on(EVENT_NAMES.request, ({ source, action, info }) => {
  if (action !== 'musicUrl') return fail('action not supported')
  if (!['wy', 'tx', 'kg'].includes(source)) return fail('source not supported')
  const mi = info.musicInfo || {}
  const q = []
  q.push('src=' + source)
  q.push('q=' + encodeURIComponent(info.type || '320k'))
  if (mi.songmid) q.push('id=' + encodeURIComponent(mi.songmid))
  if (source === 'kg' && mi.hash) q.push('hash=' + encodeURIComponent(mi.hash))
  if (source === 'tx' && mi.strMediaMid) q.push('mmid=' + encodeURIComponent(mi.strMediaMid))
  if (mi.albumId) q.push('aid=' + encodeURIComponent(mi.albumId))
  return new Promise((resolve, reject) => {
    request(API + '?' + q.join('&'), { method: 'GET', timeout: 8000, headers: { 'X-Acc-Token': TOKEN } }, (err, resp, body) => {
      if (err) return reject(new Error('[nocool] ' + (err.message || 'request failed')))
      let b = body
      if (typeof b === 'string') { try { b = JSON.parse(b) } catch (e) { b = null } }
      if (resp && resp.statusCode === 200 && b && typeof b.url === 'string' && /^https?:/.test(b.url)) return resolve(b.url)
      reject(new Error('[nocool] ' + ((b && b.error) || ('HTTP ' + (resp && resp.statusCode)))))
    })
  })
})

send(EVENT_NAMES.inited, {
  sources: {
    wy: { name: '网易云音乐', type: 'music', actions: ['musicUrl'], qualitys: QUALITYS },
    tx: { name: 'QQ音乐', type: 'music', actions: ['musicUrl'], qualitys: QUALITYS },
    kg: { name: '酷狗音乐', type: 'music', actions: ['musicUrl'], qualitys: QUALITYS },
  },
})
