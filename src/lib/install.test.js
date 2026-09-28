import { describe, it, expect } from 'vitest'
import { inAppBrowser, iosBrowser, safariVersion, chromeIntentUrl } from './install'

/* Real user-agent strings, trimmed only where they wrap. */
const UA = {
  iphoneSafari18: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  iphoneSafari26: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.119 Mobile/15E148 Safari/604.1',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; SM-A155F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
  androidMessenger: 'Mozilla/5.0 (Linux; Android 13; RMX3710 Build/TP1A.220905.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/138.0.7204.63 Mobile Safari/537.36 [FB_IAB/Orca-Android;FBAV/512.0.0.49.109;]',
  androidFacebook: 'Mozilla/5.0 (Linux; Android 14; 23108RN04Y Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/138.0.7204.63 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/521.0.0.44.108;]',
  iphoneMessenger: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/MessengerForiOS;FBAV/512.0.0.37.106;FBBV/737245203;FBDV/iPhone15,3;FBMD/iPhone;FBSN/iOS;FBSV/18.5;FBSS/3;FBID/phone;FBLC/en_US;FBOP/5]',
  iphoneInstagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 390.0.0.28.85 (iPhone15,3; iOS 18_5; en_US; en; scale=3.00; 1290x2796; 758432913)',
  androidTikTok: 'Mozilla/5.0 (Linux; Android 14; V2250 Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/138.0.7204.63 Mobile Safari/537.36 trill_410203 JsSdk/1.0 NetType/WIFI Channel/googleplay AppName/musical_ly app_version/41.2.3 ByteLocale/en',
  desktopChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
}

describe('inAppBrowser', () => {
  it('names the apps people open links in', () => {
    expect(inAppBrowser(UA.androidMessenger)).toBe('Messenger')
    expect(inAppBrowser(UA.iphoneMessenger)).toBe('Messenger')
    expect(inAppBrowser(UA.androidFacebook)).toBe('Facebook')
    expect(inAppBrowser(UA.iphoneInstagram)).toBe('Instagram')
    expect(inAppBrowser(UA.androidTikTok)).toBe('TikTok')
  })

  it('leaves real browsers alone', () => {
    for (const ua of [UA.iphoneSafari18, UA.iphoneSafari26, UA.iphoneChrome, UA.androidChrome, UA.desktopChrome]) {
      expect(inAppBrowser(ua)).toBeNull()
    }
  })

  it('still catches an Android web view it cannot name', () => {
    expect(inAppBrowser('Mozilla/5.0 (Linux; Android 12; wv) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36')).toBe('')
  })
})

describe('iosBrowser and safariVersion', () => {
  it('tells Safari from the other iPhone browsers', () => {
    expect(iosBrowser(UA.iphoneSafari18)).toBe('safari')
    expect(iosBrowser(UA.iphoneChrome)).toBe('chrome')
  })

  it("reads Safari's own version, not the frozen OS number", () => {
    expect(safariVersion(UA.iphoneSafari18)).toBe(18)
    expect(safariVersion(UA.iphoneSafari26)).toBe(26)
    expect(safariVersion(UA.iphoneChrome)).toBe(0)
  })
})

describe('chromeIntentUrl', () => {
  it('asks for Chrome by name, keeping the path and query', () => {
    expect(chromeIntentUrl('https://spendr-v2.vercel.app/onboarding?x=1'))
      .toBe('intent://spendr-v2.vercel.app/onboarding?x=1#Intent;scheme=https;package=com.android.chrome;end')
  })
})
