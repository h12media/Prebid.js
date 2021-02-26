import * as utils from '../src/utils.js';
import { registerBidder } from '../src/adapters/bidderFactory.js';
const BIDDER_CODE = 'h12media';
const DEFAULT_URL = 'https://bidder.h12-media.com/prebid/';
const DEFAULT_CURRENCY = 'USD';
const DEFAULT_TTL = 360;
const DEFAULT_NET_REVENUE = false;

export const spec = {
  code: BIDDER_CODE,
  aliases: ['h12'],

  isBidRequestValid: function(bid) {
    return !!(bid.params && bid.params.pubid);
  },

  buildRequests: function(validBidRequests, bidderRequest) {
    const isiframe = !((window.self === window.top) || window.frameElement);
    const screenSize = getClientDimensions();
    const docSize = getDocumentDimensions();

    return validBidRequests.map((bidRequest) => {
      const bidderParams = bidRequest.params;
      const requestUrl = bidderParams.endpointdom || DEFAULT_URL;
      const pubsubid = bidderParams.pubsubid;
      if (pubsubid && pubsubid.length > 32) { utils.logError('Bidder param \'pubsubid\' should be less than 32 chars.'); }
      const pubcontainerid = bidderParams.pubcontainerid;
      const adUnitElement = document.getElementById(pubcontainerid || bidRequest.adUnitCode);
      const ishidden = !isVisible(adUnitElement);
      const coords = isiframe ? {
        x: adUnitElement && adUnitElement.getBoundingClientRect().x,
        y: adUnitElement && adUnitElement.getBoundingClientRect().y,
      } : {
        x: getFramePos()[0],
        y: getFramePos()[1],
      };

      const bidrequest = {
        bidId: bidRequest.bidId,
        transactionId: bidRequest.transactionId,
        adunitId: bidRequest.adUnitCode,
        pubid: bidderParams.pubid,
        placementid: bidderParams.placementid || '',
        size: bidderParams.size || '',
        adunitSize: bidRequest.mediaTypes.banner.sizes || [],
        coords,
        ishidden,
        pubsubid,
        pubcontainerid,
      };

      return {
        method: 'POST',
        url: requestUrl,
        options: {withCredentials: true},
        data: {
          gdpr: !!utils.deepAccess(bidderRequest, 'gdprConsent.gdprApplies', false),
          gdpr_cs: utils.deepAccess(bidderRequest, 'gdprConsent.consentString', ''),
          usp: !!utils.deepAccess(bidderRequest, 'uspConsent', false),
          usp_cs: utils.deepAccess(bidderRequest, 'uspConsent', ''),
          topLevelUrl: utils.deepAccess(bidderRequest, 'refererInfo.referer', ''),
          refererUrl: window.top.document.referrer || window.document.referrer,
          isiframe,
          version: '$prebid.version$',
          ExtUserIDs: Object.keys(bidRequest.userId || {}),
          visitorInfo: {
            localTime: getLocalDateFormatted(),
            dayOfWeek: new Date().getDay(),
            screenWidth: screenSize[0],
            screenHeight: screenSize[1],
            docWidth: docSize[0],
            docHeight: docSize[1],
            scrollbarx: window.top.scrollX,
            scrollbary: window.top.scrollY,
          },
          bidrequest,
        },
      };
    });
  },

  interpretResponse: function(serverResponse, bidRequests) {
    let bidResponses = [];
    try {
      const serverBody = serverResponse.body;
      if (serverBody) {
        if (serverBody.bid) {
          const bidBody = serverBody.bid;
          const bidRequest = bidRequests.data.bidrequest;
          const bidResponse = {
            currency: serverBody.currency || DEFAULT_CURRENCY,
            netRevenue: serverBody.netRevenue || DEFAULT_NET_REVENUE,
            ttl: serverBody.ttl || DEFAULT_TTL,
            requestId: bidBody.bidId,
            cpm: bidBody.cpm,
            width: bidBody.width,
            height: bidBody.height,
            creativeId: bidBody.creativeId,
            ad: bidBody.ad,
            meta: bidBody.meta,
            mediaType: 'banner',
          };
          if (bidRequest) {
            bidResponse.pubid = bidRequest.pubid;
            bidResponse.placementid = bidRequest.placementid;
            bidResponse.size = bidRequest.size;
          }
          bidResponses.push(bidResponse);
        }
      }
      return bidResponses;
    } catch (err) {
      utils.logError(err);
    }
  },

  getUserSyncs: function(syncOptions, serverResponses, gdprConsent, usPrivacy) {
    const serverBody = serverResponses[0].body;
    const syncs = [];
    const uspApplies = !!utils.deepAccess(usPrivacy, 'uspConsent', false);
    const uspString = utils.deepAccess(usPrivacy, 'uspConsent', '');
    gdprConsent = gdprConsent || {
      gdprApplies: false, consentString: '',
    };

    if (serverBody) {
      const userSyncUrls = serverBody.usersync || [];
      const userSyncUrlProcess = url => {
        return url
          .replace('{gdpr}', gdprConsent.gdprApplies)
          .replace('{gdpr_cs}', gdprConsent.consentString)
          .replace('{usp}', uspApplies)
          .replace('{sup_cs}', uspString);
      }

      userSyncUrls.forEach(sync => {
        if (syncOptions.iframeEnabled && sync.type === 'iframe' && sync.url) {
          syncs.push({
            type: 'iframe',
            url: userSyncUrlProcess(sync.url),
          });
        }
        if (syncOptions.pixelEnabled && sync.type === 'image' && sync.url) {
          syncs.push({
            type: 'image',
            url: userSyncUrlProcess(sync.url),
          });
        }
      });
    }

    return syncs;
  },
}

function getContext(elem) {
  return elem && window.document.body.contains(elem) ? window : (window.top.document.body.contains(elem) ? top : undefined);
}

function isDefined(val) {
  return (val !== null) && (typeof val !== 'undefined');
}

function getIsHidden(elem) {
  let lastElem = elem;
  let elemHidden = false;
  let m;
  m = 0;

  do {
    m = m + 1;
    try {
      if (
        getContext(elem).getComputedStyle(lastElem).getPropertyValue('display') === 'none' ||
        getContext(elem).getComputedStyle(lastElem).getPropertyValue('visibility') === 'hidden'
      ) {
        return true;
      } else {
        elemHidden = false;
        lastElem = lastElem.parentElement;
      }
    } catch (o) {
      return false;
    }
  } while ((m < 250) && (lastElem != null) && (elemHidden === false))
  return elemHidden;
}

function isVisible(element) {
  return element && isDefined(getContext(element)) && !getIsHidden(element);
}

function getClientDimensions() {
  try {
    const t = window.top.innerWidth || window.top.document.documentElement.clientWidth || window.top.document.body.clientWidth;
    const e = window.top.innerHeight || window.top.document.documentElement.clientHeight || window.top.document.body.clientHeight;
    return [Math.round(t), Math.round(e)];
  } catch (i) {
    return [0, 0];
  }
}

function getDocumentDimensions() {
  try {
    const D = window.top.document;
    return [D.body.offsetWidth, Math.max(D.body.scrollHeight, D.documentElement.scrollHeight, D.body.offsetHeight, D.documentElement.offsetHeight, D.body.clientHeight, D.documentElement.clientHeight)]
  } catch (t) {
    return [-1, -1]
  }
}

function getLocalDateFormatted() {
  const two = num => ('0' + num).slice(-2);
  const d = new Date();
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
}

function getFramePos() {
  let t = window, m = 0;
  let frm_left = 0, frm_top = 0;
  do {
    m = m + 1;
    try {
      if (m > 1) {
        t = t.parent
      }
      frm_left = frm_left + t.frameElement.getBoundingClientRect().left;
      frm_top = frm_top + t.frameElement.getBoundingClientRect().top;
    } catch (o) { /* keep looping */
    }
  } while ((m < 100) && (t.parent !== t.self))

  return [frm_left, frm_top];
}

registerBidder(spec);
